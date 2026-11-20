# ENT-21 / ENT-22 / ENT-23 — executable integration increment

This directory contains additional platform capabilities, not three separate apps.

## LLM Training Studio (ENT-21)
From locally-uncensored-enterprise:

~~~sh
node backend/scripts/training.mjs inspect ./my-dataset.jsonl
node backend/scripts/training.mjs prepare ./my-dataset.jsonl ./new-prepared-run
node backend/scripts/training.mjs verify ./new-prepared-run
node backend/scripts/training.mjs check-config ./training-config.json
python backend/src/training/run_sft.py --dataset ./new-prepared-run --config ./training-config.json
~~~

The final line validates only. To actually train, install compatible versions of torch, transformers, datasets, peft, trl and optionally bitsandbytes in an isolated GPU environment, supply a downloaded LOCAL HF model (not GGUF) and explicitly use --execute --output /absolute/new/training/output. No model download or training is performed by dataset preparation.

JSONL: one record per line: {"instruction":"...","input":"...","output":"...","source":"operator-owned-dataset","license":"LicenseRef-Internal"}. Operators are responsible for verifying legal rights and content provenance.

Training JSON configuration must include:
~~~json
{"runId":"run_01","modelPath":"/absolute/path/to/local-hf-model","maxSteps":100,"seqLength":512,"rank":16,"alpha":32,"dropout":0.05,"learningRate":0.0002,"mode":"lora","seed":1}
~~~
Choose mode "qlora" for CUDA bitsandbytes 4-bit NF4. This runner does not convert GGUF weights to trainable model parameters or publish a model.

## Mining Control (ENT-22)
Import MinerGateway from src/mining/control.mjs. Only trusted server-side verified principals and an independent tenant-aware authorize callback may be passed; never take principal from a request body or make this class directly available to an untrusted browser. The service expects a separately deployed HTTPS mining gateway contract:
GET /v1/rigs/{id}/status => {"id":"rig-01","state":"online","watts":750,"hashrateHs":100000}.
POST /v1/rigs/{id}/commands => {"action":"set_power","watts":800,"idempotencyKey":"..."}; response {"accepted":true,"commandId":"command-01"}.
The gateway MUST implement durable idempotency and device authentication itself, and ensure operator ownership. Controller supports prepare()/execute() requiring explicit confirmation. No hardware was connected.

## Virtual Number (ENT-23)
Import TwilioNumbers from src/telecom/twilio.mjs. Supply account-specific Twilio SID/key/secret from secure runtime configuration, trusted authorize callback and recipientConsent callback. Methods owned(), available(), prepareSms(), sendSms() operate through documented Twilio API endpoints; there is intentionally NO auto-purchase or unsolicited outreach. Live sending can incur charges; do not call sendSms() until operator approval, identity authorization, verified provider ownership, durable quota and legal compliance are wired. This increment performs no real telecom operation. Internal memory quotas are not billing protection.

## Verification
~~~sh
node --test backend/test/enterprise-services.test.mjs
python -m py_compile backend/src/training/run_sft.py
~~~

See docs/OMEGA_ENT_TRAINING_MINING_TELECOM_EVIDENCE.md in the repository root. Full application integration and production security acceptance remain open.
