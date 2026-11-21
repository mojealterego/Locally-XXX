# ENT-29 — deterministic local audit evidence

Date: 2026-11-21. Baseline: `main` at `3b4ff4e3a6f55eb5e790eef99061156a33300365`.

## Executed local tests

- Environment: Linux, Node.js 22.16.0 (node:sqlite experimental API), real local SQLite files and loopback HTTP; no cloud provider calls.
- RED: before implementation, `node --test test/observability.test.mjs` failed with `ERR_MODULE_NOT_FOUND` (missing audit modules).
- GREEN: after implementation and patching the byte-buffer HMAC verifier, `node --test test/observability.test.mjs` produced **13 PASS, 0 FAIL** (AUD-01..13), runtime 454.736 ms. The later test run used local copies of the actual `SearchGateway` and `GvisorRunner` from `main`, with synthetic HTTP fetch. No real gVisor execution or external API call.
- Syntax: `node --check` passed for `src/observability/{ledger,http,start}.mjs` and `src/orchestration/{graph-runner,agent-runtime}.mjs`.
- Coverage: immutable event whitelist, tenant scope, private file permissions, rollback/reopen, two SQLite connections, capacity cap, HMAC tamper detection, denial/fail-closed on audit failure, HTTP OIDC/PDP/origin rejection, SSE event IDs, cursor pagination, runtime event emission, non-disclosure of inputs, and legacy graph ordering.

## Source evidence (locally measured SHA-256)

- `src/observability/ledger.mjs`: `916c821434355fd163b5725774aa520e83f273effb54b0f00d7ea9c070df32df`
- `src/observability/http.mjs`: `647db966f3b49ff011026a6d7d1db932fe8c4b5a53135ebb2917612269ff5f6c`
- `src/observability/start.mjs`: `a2ec46b54cfb619592f1e6ee98d2a38cf50cf32286091634bdc528af17406d97`
- `src/orchestration/graph-runner.mjs`: `67ac92823f1301b22cf337c0361f728e8a8b9452374eec7354ce964b589d8666`
- `src/orchestration/agent-runtime.mjs`: `6c8eec4ccbf1a3a53044dfae8cf12111da15f80e4f5c11e5554c2be289769c5c`

Git blob SHA were checked after upload. Realtime browser proxy, installed desktop/Tauri runtime, physical Android, actual Temporal, Redis/Postgres, Keycloak, Permit, OpenTelemetry collector and cluster recovery were **NOT RUN** in this increment. No running hosted service was deployed.

## Release gates

Local functional test subset: PASS. Full system integration/E2E: OPEN. Security: PARTIAL (synthetic access control + local confidentiality checks; no production security review). Durability: local SQLite tested; cross-host HA and clock/system-compromise resistance OPEN. **ENT-29 PARTIAL; global GATE-09 OPEN.**
