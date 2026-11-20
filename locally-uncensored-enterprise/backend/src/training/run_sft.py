"""Offline, explicitly authorized PEFT SFT/QLoRA runner. No downloads or arbitrary remote code."""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path


def load_manifest(dataset_dir: Path):
    manifest = json.loads((dataset_dir / "manifest.json").read_text("utf-8"))
    if manifest.get("format") != "omega-sft-v1":
        raise ValueError("invalid dataset format")
    for name, field in (("train.jsonl", "trainSha256"), ("eval.jsonl", "evalSha256")):
        data = (dataset_dir / name).read_bytes()
        if len(data) > 16_777_216 or hashlib.sha256(data).hexdigest() != manifest.get(field):
            raise ValueError(f"dataset integrity failed: {name}")
    if not isinstance(manifest.get("train"), int) or not isinstance(manifest.get("eval"), int) or min(manifest["train"], manifest["eval"]) < 1:
        raise ValueError("empty split")
    return manifest


def validate_config(config: dict):
    if set(config) != {"runId", "modelPath", "maxSteps", "seqLength", "rank", "alpha", "dropout", "learningRate", "mode", "seed"}:
        raise ValueError("unknown training config fields")
    if not isinstance(config["runId"], str) or not re.fullmatch(r"[a-z][a-z0-9_-]{1,63}", config["runId"]):
        raise ValueError("invalid run ID")
    if config["mode"] not in ("lora", "qlora"):
        raise ValueError("unsupported mode")
    for name, lo, hi in (("maxSteps", 1, 100000), ("seqLength", 128, 8192), ("rank", 1, 256), ("alpha", 1, 1024), ("seed", 0, 2147483647)):
        v = config[name]
        if type(v) is not int or not lo <= v <= hi:
            raise ValueError(f"invalid {name}")
    for name, lo, hi in (("learningRate", 0., 0.01), ("dropout", -0.0000001, 1.)):
        v = config[name]
        if type(v) not in (float, int) or not lo < v < hi:
            raise ValueError(f"invalid {name}")
    model_dir = Path(config["modelPath"])
    if not model_dir.is_absolute() or not model_dir.is_dir() or model_dir.is_symlink():
        raise ValueError("model must be a local non-symlink directory")
    if not (model_dir / "config.json").is_file():
        raise ValueError("local HuggingFace model config is required (GGUF not trainable here)")
    return model_dir


def run_training(config, dataset, output):
    import torch
    from datasets import Dataset
    from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
    from peft import LoraConfig, TaskType
    from trl import SFTConfig, SFTTrainer

    model_path = str(validate_config(config))
    if output.exists():
        raise ValueError("output directory already exists")
    if config["mode"] == "qlora" and not torch.cuda.is_available():
        raise RuntimeError("QLoRA requires a working CUDA environment in this adapter")
    torch.manual_seed(config["seed"])
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(config["seed"])
    dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else (torch.float16 if torch.cuda.is_available() else torch.float32)
    kw = dict(local_files_only=True, trust_remote_code=False, dtype=dtype)
    if config["mode"] == "qlora":
        kw["quantization_config"] = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=dtype, bnb_4bit_use_double_quant=True)
        kw["device_map"] = "auto"
    model = AutoModelForCausalLM.from_pretrained(model_path, **kw)
    tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True, trust_remote_code=False)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    def rows(name):
        with (dataset / name).open(encoding="utf-8") as stream:
            return Dataset.from_list([json.loads(line) for line in stream if line.strip()])

    train = rows("train.jsonl")
    eval_data = rows("eval.jsonl")
    output.mkdir(mode=0o700)
    args = SFTConfig(output_dir=str(output), max_steps=config["maxSteps"], max_length=config["seqLength"], dataset_text_field="text", packing=False, per_device_train_batch_size=1, per_device_eval_batch_size=1, gradient_accumulation_steps=4, learning_rate=config["learningRate"], seed=config["seed"], save_strategy="steps", save_steps=min(100, config["maxSteps"]), eval_strategy="steps", eval_steps=min(100, config["maxSteps"]), report_to="none", bf16=(dtype==torch.bfloat16), fp16=(dtype==torch.float16), save_safetensors=True)
    lora = LoraConfig(r=config["rank"], lora_alpha=config["alpha"], lora_dropout=config["dropout"], task_type=TaskType.CAUSAL_LM, target_modules="all-linear", bias="none")
    trainer = SFTTrainer(model=model, args=args, train_dataset=train, eval_dataset=eval_data, peft_config=lora, processing_class=tokenizer)
    trainer.train()
    trainer.save_model(str(output))
    tokenizer.save_pretrained(str(output))
    (output / "omega_run.json").write_text(json.dumps({"config": config, "dataset": load_manifest(dataset)}, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--execute", action="store_true")
    a = parser.parse_args()
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    manifest = load_manifest(a.dataset)
    config = json.loads(a.config.read_text("utf-8"))
    validate_config(config)
    if a.execute:
        if a.output is None or not a.output.is_absolute():
            raise ValueError("absolute --output required for execution")
        run_training(config, a.dataset, a.output)
        print(json.dumps({"status": "TRAINED", "output": str(a.output)}))
    else:
        print(json.dumps({"status": "VALIDATED_ONLY", "datasetSha256": manifest["sourceSha256"], "mode": config["mode"]}))


if __name__ == "__main__":
    main()
