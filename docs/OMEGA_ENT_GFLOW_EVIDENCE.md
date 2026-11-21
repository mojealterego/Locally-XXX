# ENT-50 — Google Cloud Vertex video bridge (increment 2026-11-21)

Repo: `mojealterego/Locally-XXX`, only `main`. Baseline SHA at implementation start: `50dc0a5127ed32439361079cb242ed5c55e249b8`.

## Source assessment

User material proposes a Google Labs Flow private JSON API, `clientContext` with reCAPTCHA token, `flow_register_identity` and `flow_extend_clip`; the attached source code has syntax gaps and an incorrect `characterMappings: string` typing while using `.forEach`. Private Flow routes are **not** certified as an official public integration. Instead, first-party Google Cloud documentation confirms `predictLongRunning` and `fetchPredictOperation` for the Veo model via Vertex AI. We do not implement any reCAPTCHA solver, unverified Google Flow endpoint or moderation circumvention.

Sources:
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate

## Local verification

Environment: Linux, Node.js v22.16.0, npm 10.9.2, built-in `node:sqlite`, local temporary directory (0700), no network/provider credential and no package install.

RED: `node --test test/flow.test.mjs` failed with `ERR_MODULE_NOT_FOUND` when the test-first suite was created. GREEN: run the same command from `packages/awesome-gflow-mcp/`; **GF-01..21 = 21 PASS, 0 FAIL**. Tests cover deterministic master scene compiler, strict schema/secret rejection, allowlisted Google hosts/models, default-off egress, real local SQLite state + quota across two connections, idempotency, crash-ambiguous submission, tenant separation, operation tampering, terminal safety filtering without prompt rewriting, bounded retry for polling only, origin GCS prefix binding, actual stdio MCP subprocess, authorization binding and oversized response denial. External provider transport is mocked, and the actual Google Cloud endpoints are **not contacted**.

`node --check` was applied to all new `.mjs` sources; test runner itself loads and compiles all these ESM modules. A full repository clone was not available in local runner because GitHub DNS resolution failed; code is published by git tree/commit API using an explicit, non-force HEAD lease. Actual full application CI/React/Rust/Android, live IdP, provider, cloud billing and production isolated network tests: NOT_RUN.

## Release assessment

GATE-01 requirements: PARTIAL (validated official public video API only; reference IDs, clip extension/upscale, real media pipeline OPEN). GATE-02 architecture: PARTIAL (MCP offline + library with injected trusted approval). GATE-03 implementation: PARTIAL (live user auth and lifecycle integration OPEN). GATE-04 local deterministic tests: PASS for 21 covered cases. GATE-05 real integration/E2E: BLOCKED until approved Google Cloud credentials and authorized egress. GATE-06 security: PARTIAL; exact project/tenant binding, SSRF-surface minimization, no secrets at rest, tests; external audit and production IAM OPEN. GATE-07 reliability: PARTIAL (single-node SQLite, no retry on ambiguous writes; recovery and multi-node OPEN). GATE-08 docs: new module README and this evidence. GATE-09 global: **OPEN**. No paid cloud operations executed.
