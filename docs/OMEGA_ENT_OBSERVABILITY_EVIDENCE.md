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
- `src/observability/start.mjs`: `29832b34b49e72720d398527db0148bde7edfb9b05802f9d451aeaba8435540d`
- `src/orchestration/graph-runner.mjs`: `67ac92823f1301b22cf337c0361f728e8a8b9452374eec7354ce964b589d8666`
- `src/orchestration/agent-runtime.mjs`: `6c8eec4ccbf1a3a53044dfae8cf12111da15f80e4f5c11e5554c2be289769c5c`

Git blob SHA were checked after upload. Realtime browser proxy, installed desktop/Tauri runtime, physical Android, actual Temporal, Redis/Postgres, Keycloak, Permit, OpenTelemetry collector and cluster recovery were **NOT RUN** in this increment. No running hosted service was deployed.

## Release gates

Local functional test subset: PASS. Full system integration/E2E: OPEN. Security: PARTIAL (synthetic access control + local confidentiality checks; no production security review). Durability: local SQLite tested; cross-host HA and clock/system-compromise resistance OPEN. **ENT-29 PARTIAL; global GATE-09 OPEN.**

## Same-origin proxy checkpoint (APX-01..04)

RED: four newly added tests failed against baseline web proxy because `/api/audit/*` routes were not recognized (404). GREEN: `node --test test/observability.test.mjs test/audit-proxy.test.mjs` — **17 PASS, 0 FAIL**, Linux Node 22.16.0; 491.146 ms. APX-01 verifies fixed-loopback forwarding and cookie stripping, APX-02 origin/token/route refusal, APX-03 SSE forwarding, APX-04 4096-byte request admission. This test launches the real web proxy process and localhost stub audit upstream; no static web build is required for the proxy requests. Cloud gateway and review routes were not re-exercised in this test. SHA-256: `apps/web/serve.mjs` a4e856d49d5f01e57ef2071950e55cb9d9de2e4db1961dde7e961ea6ddba11b8; `backend/test/audit-proxy.test.mjs` bef9d1af5fcbe8dc40406bebcaad6715e41d1d0e2f8621157c96e39f1dd39e31. ENT-29 remains PARTIAL; GATE-09 OPEN.

## Cross-proxy regression check (2026-11-21)

Executed `node --test test/cloud-proxy.test.mjs test/audit-proxy.test.mjs test/observability.test.mjs` using pre-existing CLD-18/19 test source (Git blob SHA `41c16a0b37f577efc7518f05af602e94fc9f9ae5`), new audit tests and updated web proxy: **19/19 PASS**, 547.182 ms on Linux Node 22.16.0. In an isolated local mirror, minimal synthetic `dist/index.html` and `dist/modules/cloud-ui.mjs` were required for the old CLD probe; initial failures without them were fixture setup failures. These fixtures were not added to Git. This check confirms same-origin Cloud/Audit proxy regression behavior under synthetic local backends only, not production web build or browser end-to-end integration.
