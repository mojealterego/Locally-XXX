# OMEGA Enterprise — ENT-21/ENT-22/ENT-23, evidence and limitations

Date: 2026-11-21. Base branch main: 53cd07812404733a12399c408571e7eeebff9db0. All changes additive. No paid CI, irreversible actions or secrets used.

## ENT-21 LLM Training Studio
- Source modules: backend/src/training/dataset.mjs, backend/src/training/run_sft.py, backend/scripts/training.mjs.
- Dataset contract: newline-separated JSON records with required instruction, output, source, license; optional input. Per-row limits, explicit provenance labels (not independent legal verification), deduplication, deterministic SHA256 bucket split, train/eval JSONL, manifest of input/split hashes. Existing destination directories cannot be overwritten. CLI inspect/prepare/verify/check-config operates without model downloads.
- Python runner supports a LOCAL Hugging Face transformers model folder (config.json, weights, tokenizer), SFTTrainer + PEFT LoRA / bitsandbytes NF4 QLoRA, offline-only local_files_only/trust_remote_code=false, no telemetry reporting, seed and max steps. It starts training ONLY with explicit --execute and absolute new output directory. It does not train GGUF directly, perform abliterated refusal-vector removal, export GGUF, verify training rights or evaluate result quality on benchmark suites.
- TRAIN-01..06: 6/6 PASS for validation, split, provenance, tampering, immutable output, Python configuration-only check and actual Node CLI. No model weights loaded. No fine tuning executed: transformers, datasets, trl, peft unavailable in the test runtime (torch available), hence real SFT/QLoRA E2E NOT_RUN.

## ENT-22 Mining Control
- Source: backend/src/mining/control.mjs.
- Operator-controlled registry of up to 64 devices with tenant ID, pinned HTTPS endpoint (HTTP loopback only with explicit dev flag), min/max power policy, trusted authorize and credential provider callbacks.
- Status uses GET /v1/rigs/{id}/status; commands POST /v1/rigs/{id}/commands with action pause/resume/set_power, bounded power and opaque idempotency key. These paths define a custom mining gateway contract; they are NOT advertised as CGMiner/Antminer manufacturer APIs. Request timeouts, redirect forbidden, response size bound. Prepare/execute confirmation requires same subject/tenant and challenge before 60s. A failed/unknown command cannot be retried within the instance automatically. This is not a durable cluster-wide exactly-once guarantee.
- MINE-01..03: 3/3 PASS; test executes actual loopback HTTP against fixture gateway, checks approval/limits/denied tenants/expiry. No real miner connected, no remote policy engine wired and no live physical commands executed.
- OPEN: vendor-specific adapter, real equipment, trusted OIDC/PDP enforcement at service ingress, durable idempotency/outbox, persistent audit, rollback and command reconciliation.

## ENT-23 Virtual Number
- Source: backend/src/telecom/twilio.mjs. Twilio's documented REST paths are used for reading owned numbers and searching available numbers, plus building POST Messages.json for a consented sender/recipient. API key SID and secret are provided at runtime by trusted service configuration, not stored in repository.
- Sender must belong to the connected Twilio account. Recipient must pass trusted recipientConsent callback. Two-phase challenge confirmation is time-scoped and bound to subject/tenant. Body length limited, per-day send counter in process and response cap/timeout; no unapproved send, purchases, Voice APIs or verification bypass. This is NOT a durable billing limit; quotas reset on restart.
- PHONE-01..04: 4/4 PASS; only mocked Twilio HTTPS fetch, no Twilio credentials/real SMS/number provisioning, calls, real costs or live account operations.
- OPEN: provider account provisioning/regulatory bundles, actual consent capture, inbound webhooks, calls, PSTN, verified service tenancy, durable billing and quota, OIDC/PDP ingress integration and user UI.

## Fresh local verification and classification
- Environment: Node v22.16.0, Python 3.x Linux, Git 2.47.3. Offline container without GitHub source checkout, external devices, model weights, cloud credentials or vendor dependencies.
- Command run: cd locally-uncensored-enterprise/backend && node --test test/enterprise-services.test.mjs
- Result: 13 tests, 13 PASS, 0 failed/skipped/cancelled; log SHA256: 7801243924909db678071f8a82c16c7c1cae85d9f4ba61463022b143d09e070b
- Commands run: node --check src/training/dataset.mjs; node --check src/mining/control.mjs; node --check src/telecom/twilio.mjs; node --check scripts/training.mjs; python -m py_compile src/training/run_sft.py — PASS.
- Core training validates with a synthetic local model config but NEVER calls --execute. Tests do not establish actual PEFT/TRL compatibility with a concrete installed model.
- Git blob hashes for tested sources: dataset.mjs 2cc1faf946253ca2dcc3377cb20223890023f6a2; run_sft.py 239700a1260eee235ca48a8adea9964666da80ee; mining/control.mjs bbd309f3ad6e2b0d68e8685a789a7c418cc58e85; telecom/twilio.mjs 6bd81e2cb79569099d08b82974f15e5f334a2e55; scripts/training.mjs 1b7721705f1a15d2d3246ea64e5aa1b44684c9ad; test/enterprise-services.test.mjs 7e63797d556ffb2aa561fc751332b8c772ee3643.
- RED test stage was not recorded for these three modules before implementation; green tests prove only the tested behaviors.
- Previous backend/desktop/mobile/full browser and cluster regression suites NOT_RUN for this increment.
- GATE-04 LOCAL_EXECUTION PASS for the 13 scoped tests; ENT-21/22/23 remain PARTIAL and GATE-05/06/07/09 OPEN pending real integration, physical tests and security gates. No claim of 100% completion.
- The user-provided enterprise architecture is a target specification. It is not evidence of current deployment, licensing safety, guaranteed data privacy, hidden model reasoning visibility, or numerical performance.
