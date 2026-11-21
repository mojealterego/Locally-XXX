# OMEGA Enterprise — ENT-44/45/46 verified increment

Date: 2026-11-21. Base commit `5da0b42b0fd08eb0b3348f7e8b414af55f28b11a`. Only `main`; no paid CI, no external API requests, no secrets committed.

## Implemented
ENT-44: strictly opt-in seven-provider gateway and fixed egress. Prompt contract and request normalization; no auto-fallback to cloud and no automatic RAG upload. Heuristic DLP rejects common secret patterns but cannot guarantee absence of sensitive data.

ENT-45: authenticated per-tenant encrypted credential store using Node AES-256-GCM and SQLite; external 32-byte master key with permission check, no plaintext in DB, revoke/status, no log of keys. OS KMS/rotation/cluster remains OPEN.

ENT-46: OIDC + Permit-protected HTTP surface, one-use approval ticket SHA-256 bound to exact prompt/identity/tenant, native SSE provider parsing for visible tokens only, web same-origin proxy with explicit path and Origin allowlists. Browser UI is added as an opt-in launcher module. No model downloads or cloud payments.

## Executed local tests
1. `cd locally-uncensored-enterprise/backend && node --test test/cloud.test.mjs`
   - CLD-01..17 — 17/17 PASS, no failures, no skips, no cancellations.
   - File log SHA-256: `10eda31ee6093f87bb6aa93ab2edda443a40c66ac11ccf1cc25959eabef95c1d`
   - Code tested: cloud policy/provider parser, encrypted vault persistence, OIDC/PDP mocks, real localhost HTTP service, one-shot consent, no outbound request when disabled.
2. `cd locally-uncensored-enterprise/backend && node --test test/cloud-proxy.test.mjs`
   - CLD-18..19 — 2/2 PASS, real local HTTP network, spawned web proxy, strict Origin/bearer routes, live SSE relaying from a controlled fixture upstream.
3. `node --check` passed for `backend/src/cloud/{policy,vault,providers,http,start}.mjs`, `apps/web/cloud-ui.mjs`, and `apps/web/serve.mjs`.

**Regression scope:** the existing codebase's complete test suite, TypeScript compile, Tauri/Rust, real browser E2E, live IdP/Permit and provider APIs were NOT_RUN. In particular, tests do not prove deployed production readiness, trustworthiness of user classification, or any paid API service quality. Status ENT-44/45/46 PARTIAL; GATE-05/06/07/09 OPEN.

## Implementation artifacts
- Backend `src/cloud/policy.mjs`, `vault.mjs`, `providers.mjs`, `http.mjs`, `start.mjs`.
- Web `apps/web/cloud-ui.mjs`, `apps/web/serve.mjs`; shell module and catalog integration, static asset allowlist; backend/root scripts.
- `backend/test/cloud.test.mjs`, `backend/test/cloud-proxy.test.mjs`, documentation.

## Security notes
The external model API sees the public prompt and may retain it according to its own policies. Only visible result text is forwarded to the client; do not present model-internal hidden reasoning as an auditable proof. No claim of cryptographic data isolation across provider infrastructure. An AGPL network deployment may create source-code distribution duties; separating services does not automatically eliminate licensing obligations.
