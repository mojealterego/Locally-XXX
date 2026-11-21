# OMEGA Enterprise — Cloud Multi-Provider Gateway

Status: **PARTIAL (ENT-44/45/46)**. Build target: Node.js >=22.16.0. No real paid API calls, Keycloak, PDP cluster, OS KMS, Tauri Rust transport or browser E2E executed in this increment.

## Architektur i komponenty

- `src/cloud/policy.mjs`: fixed provider allowlist; explicitly `enabled=false` by default; no automatic local-to-cloud fallback; prompt classification must be `public`; DLP heuristics check common secret formats but **do not guarantee data confidentiality**. User remains responsible for deciding whether data may leave the device. Bound request fields, body length 64 KiB, 32 messages and 2048 requested output tokens.
- `src/cloud/vault.mjs`: per-tenant/provider SQLite credential store, AES-256-GCM (new random nonce and AAD `tenant:provider:v1` per update). Requires an **external** 32-byte master key file with mode 0600 and user-owned private directory 0700. Storage directory must not be a symlink, database mode 0600; never saves plaintext credentials. Not a replacement for hardware-backed KMS / OS keyring, no automatic key rotation, backups or cluster distribution yet.
- `src/cloud/providers.mjs`: 7 fixed HTTPS URLs; no user-specified URLs, redirects denied, timeouts and stream caps; OpenAI-compatible streaming and Anthropic Messages streaming translated into **visible text only**. Does not expose hidden chain-of-thought, refusal traces, prompt secrets or arbitrary tool calls. Actual provider model compatibility is not verified.
- `src/cloud/http.mjs`: localhost HTTP API with existing Oidc and Permit PDP; per-action `create` / `interact`, resource `cloud-gateway`; request payload bound to a 60-second, single-use, tenant- and principal-scoped approval. Normalized SSE `event: token` and `event: done`. Credentials are never returned to HTTP clients.
- `src/cloud/start.mjs`: startup using existing OIDC and PDP config; listens on 127.0.0.1, default `CLOUD_PORT=3002`. Shuts down and zeroizes master key on server close. The web app communicates only with same-origin `/api/cloud/*` routes via `apps/web/serve.mjs`; browser never directly contacts a cloud provider.

## Providers and request protocol

| Provider | Fixed URL | Auth |
|---|---|---|
| OpenAI | https://api.openai.com/v1/chat/completions | Bearer |
| Anthropic | https://api.anthropic.com/v1/messages | x-api-key, anthropic-version=2023-06-01 |
| OpenRouter | https://openrouter.ai/api/v1/chat/completions | Bearer |
| Groq | https://api.groq.com/openai/v1/chat/completions | Bearer |
| Together | https://api.together.xyz/v1/chat/completions | Bearer |
| DeepSeek | https://api.deepseek.com/chat/completions | Bearer |
| Mistral | https://api.mistral.ai/v1/chat/completions | Bearer |

Confirm endpoint versions, permitted model IDs, pricing and actual compatibility before production use. No model is assumed available by name alone.

## Safe startup

1. Provision Keycloak OIDC issuer/audience/client and a Permit PDP policy allowing resource Agent key `cloud-gateway` for selected subjects and tenants. Authentication is server-side; the current browser form accepts an access token manually and **does not implement PKCE**.
2. Secure the vault folder (0700) and **externally** provision a random 32-byte master key file (0600). Example on an isolated administrator machine: `umask 077; head -c 32 /dev/urandom > /secure/outside/repo/master.key`. Do not publish the file or embed it in Git.
3. Set `OMEGA_OIDC_ISSUER`, `OMEGA_OIDC_AUDIENCE`, `OMEGA_OIDC_CLIENT`, `OMEGA_PDP_URL`, `OMEGA_PDP_KEY_FILE`, `OMEGA_CLOUD_VAULT_DIR`, `OMEGA_CLOUD_MASTER_KEY_FILE`, and optional `CLOUD_PORT` in the trusted server runtime.
4. `OMEGA_CLOUD_ENABLED` defaults to **off**. Set exactly `YES` only after reviewing security, compliance, allowed traffic, local DNS and budget. This changes real egress ability and can incur provider charges. Never set automatically in CI.
5. Run `node src/cloud/start.mjs` from `backend` and the existing local `node apps/web/serve.mjs`. The browser sends credentials only to the local origin, after an authenticated action.
6. Store provider credential via `POST /api/cloud/credential` and submit a public prompt via `POST /api/cloud/approve`; use the one-time ticket with an exact matching request in `POST /api/cloud/stream`. Provider requests are neither queued nor retried automatically.

The gateway does **not** automatically include RAG chunks, system logs, hidden reasoning, conversation archives or files. A prompt manually copied into the cloud editor is still transmitted externally when approved. No product can guarantee 100% privacy after external transmission.

## Tests

Run `node --test test/cloud.test.mjs test/cloud-proxy.test.mjs` from backend (the proxy test needs Node.js and local socket access). Existing local run: CLD-01..CLD-17 **17/17 PASS**, CLD-18..CLD-19 **2/2 PASS**. All tests use synthetic keys, fake JWKS/PDP or provider transport, and real localhost HTTP sockets. **No real paid provider calls were made.** See `docs/OMEGA_ENT_CLOUD_GATEWAY_EVIDENCE.md` for test hashes and explicit GATE limitations.

## Outstanding gates

- Real OIDC PKCE login and Permit policy integration/E2E for multiple tenants and reverse proxy behavior.
- OS keyring/KMS, shared cluster vault, key rotation, audit logs with redaction proof, durable rate and cost controls.
- Provider current schema compatibility tests using real user-approved credentials and billing guardrails.
- API/transport security review, CSP, browser E2E, Tauri v2 Rust proxy, multi-platform build, load and chaos tests.
- Threat-model review for exfiltration/prompt injection: heuristic DLP is not a security boundary.

**GATE-09 remains OPEN.** The increment is not a claim of deployed or production-verified cloud connectivity.
