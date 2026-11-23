"""Deterministic admission planner for attention/training profiles, not a GPU runtime.

No allocation, secrets, network access or GPU kernels are executed here. A validated
plan MUST still pass runtime capability probes and experimental numerical checks.
"""
from __future__ import annotations
import json
from dataclasses import dataclass
from typing import Any

class ConfigError(ValueError):
    """Unsupported or unsafe profile selection."""

FIELDS = frozenset({"mode", "accelerator", "compute_capability", "gpu_count", "head_count",
                    "kv_head_count", "head_dim", "layers", "context_tokens", "kv_dtype",
                    "attention", "parallel", "precision", "model_format", "training_strategy",
                    "tensor_parallel", "pipeline_parallel"})
OPTIONS = {
    "mode": {"inference", "training", "fine_tune"},
    "accelerator": {"cuda", "android", "cpu"},
    "kv_dtype": {"fp16", "q8_0", "q4_0"},
    "attention": {"auto", "math", "native_sdpa", "fa2", "fa3"},
    "parallel": {"none", "fsdp2", "zero1", "zero2", "zero3", "megatron"},
    "precision": {"fp32", "fp16", "bf16", "fp8"},
    "model_format": {"safetensors", "gguf"},
    "training_strategy": {"none", "lora", "qlora_nf4"},
}
SUPPORTED_FP8_CC = {89, 90, 100, 103, 120}  # provisional enable-list; TE runtime probe is mandatory


def plan_job(profile: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(profile, dict) or set(profile) != FIELDS:
        raise ConfigError("Exactly the specified profile keys are required")
    for name, accepted in OPTIONS.items():
        if not isinstance(profile[name], str) or profile[name] not in accepted:
            raise ConfigError(f"Unsupported {name}")
    for name, maximum in (("gpu_count", 4096), ("head_count", 8192), ("kv_head_count", 8192),
                          ("head_dim", 8192), ("layers", 4096), ("context_tokens", 10_000_000),
                          ("tensor_parallel", 4096), ("pipeline_parallel", 4096)):
        n = profile[name]
        if type(n) is not int or not (1 <= n <= maximum):
            raise ConfigError(f"Invalid {name}")
    cc = profile["compute_capability"]
    if cc is not None and (type(cc) is not int or cc not in (75, 80, 86, 89, 90, 100, 103, 120)):
        raise ConfigError("Invalid NVIDIA compute capability")
    if profile["accelerator"] == "cuda" and cc is None:
        raise ConfigError("CUDA accelerator requires an explicit compute capability")
    if profile["accelerator"] != "cuda" and cc is not None:
        raise ConfigError("Compute capability applies only to NVIDIA CUDA")
    hq, hkv = profile["head_count"], profile["kv_head_count"]
    if hkv > hq or hq % hkv:
        raise ConfigError("KV head count must divide query heads")
    if profile["kv_dtype"] != "fp16" and profile["head_dim"] % 32:
        raise ConfigError("Quantized KV cache requires head_dim divisible by 32")
    if profile["accelerator"] != "cuda" and profile["gpu_count"] != 1:
        raise ConfigError("Non-CUDA profile cannot declare multi-GPU distributed training")
    if profile["accelerator"] == "android" and profile["mode"] != "inference":
        raise ConfigError("This reference policy does not admit Android training")
    if profile["accelerator"] == "cpu" and profile["precision"] != "fp32":
        raise ConfigError("Unprobed CPU mixed precision is disabled")
    if profile["precision"] == "fp8" and not (profile["accelerator"] == "cuda" and cc in SUPPORTED_FP8_CC):
        raise ConfigError("FP8 requires a provisionally supported NVIDIA GPU and runtime probe")
    if profile["mode"] == "inference" and profile["training_strategy"] != "none":
        raise ConfigError("Training adapters may only be configured for fine tuning")
    if profile["mode"] == "training" and profile["training_strategy"] != "none":
        raise ConfigError("LoRA/QLoRA strategy requires fine_tune mode")
    if profile["mode"] == "fine_tune" and profile["training_strategy"] == "none":
        raise ConfigError("Fine tuning requires an explicit PEFT strategy in this reference policy")
    if profile["training_strategy"] == "qlora_nf4":
        if profile["accelerator"] != "cuda" or profile["model_format"] != "safetensors":
            raise ConfigError("QLoRA NF4 requires supported CUDA + safetensors weights")
    if profile["mode"] != "inference" and profile["model_format"] != "safetensors":
        raise ConfigError("Training workflow uses safetensors checkpoints, not GGUF")
    if profile["mode"] != "inference" and profile["accelerator"] != "cuda":
        raise ConfigError("Distributed training runtime is currently NVIDIA CUDA only")
    if profile["mode"] == "inference" and profile["parallel"] != "none":
        raise ConfigError("Training parallelism cannot be configured on an inference profile")
    if profile["parallel"] in {"fsdp2", "zero1", "zero2", "zero3", "megatron"}:
        if profile["mode"] not in {"training", "fine_tune"} or profile["gpu_count"] < 2:
            raise ConfigError("Training parallelism requires multiple GPUs")
    if profile["parallel"] == "megatron":
        tp, pp, n = profile["tensor_parallel"], profile["pipeline_parallel"], profile["gpu_count"]
        if n % (tp * pp) or hq % tp or profile["layers"] % pp:
            raise ConfigError("Megatron TP x PP must divide GPUs, heads and layers")
    elif profile["tensor_parallel"] != 1 or profile["pipeline_parallel"] != 1:
        raise ConfigError("Tensor/pipeline parallel sizes require Megatron")
    att = profile["attention"]
    if att == "auto":
        att = "fa3" if profile["accelerator"] == "cuda" and cc == 90 else (
            "fa2" if profile["accelerator"] == "cuda" and cc >= 80 else
            "native_sdpa" if profile["accelerator"] == "android" else "math")
    if att == "fa3" and not (profile["accelerator"] == "cuda" and cc == 90):
        raise ConfigError("FlashAttention-3 profile requires validated Hopper sm90")
    if att == "fa2" and not (profile["accelerator"] == "cuda" and cc >= 80):
        raise ConfigError("FlashAttention-2 profile requires supported CUDA GPU")
    if att == "native_sdpa" and profile["accelerator"] != "android":
        raise ConfigError("native_sdpa is the Android engine-specific backend")
    if att == "math" and profile["accelerator"] == "android":
        # Math fallback is also available on Android via native kernels if validated.
        pass
    # The cache formula is for one sequence, one model, ignoring allocator padding, sliding window,
    # prefix sharing, page fragmentation, tensor alignment and engine-specific extra state.
    element_bytes = {"fp16": (2, 1), "q8_0": (34, 32), "q4_0": (18, 32)}[profile["kv_dtype"]]
    num, den = element_bytes
    items = 2 * profile["layers"] * profile["context_tokens"] * hkv * profile["head_dim"]
    kv_cache_bytes = (items * num + den - 1) // den
    warnings = ["No runtime probe has been executed; kernel selection is provisional.",
                "KV estimate excludes allocator padding, batching, prefix cache and fragmentation.",
                "Model accuracy and achievable latency require benchmarking on target hardware."]
    if profile["precision"] == "fp8":
        warnings.append("FP8 requires Transformer Engine support and numerical calibration/stability verification.")
    if profile["training_strategy"] == "qlora_nf4":
        warnings.append("QLoRA stores NF4 base weights; it does not train 4-bit gradients or guarantee VRAM fit.")
    if att == "fa3":
        warnings.append("FlashAttention-3 is a Hopper-specific optimization; validate features and build versions.")
    return {
        "admitted": True,
        "mode": profile["mode"],
        "accelerator": profile["accelerator"],
        "attention_backend": att,
        "parallel": profile["parallel"],
        "training_strategy": profile["training_strategy"],
        "precision": profile["precision"],
        "gqa_ratio": hq // hkv,
        "kv_cache_bytes": kv_cache_bytes,
        "runtime_capability_probe_required": True,
        "model_quality_validation_required": True,
        "warnings": warnings,
    }


def main() -> int:
    import argparse, sys
    parser = argparse.ArgumentParser(description="Validate an OMEGA attention/training profile")
    parser.add_argument("profile", help="Path to JSON input profile")
    args = parser.parse_args()
    try:
        with open(args.profile, encoding="utf-8") as stream:
            payload = json.load(stream)
        decision = plan_job(payload)
    except (ConfigError, ValueError, OSError) as exc:
        print(json.dumps({"admitted": False, "error": str(exc)}), file=sys.stderr)
        return 2
    print(json.dumps(decision, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
