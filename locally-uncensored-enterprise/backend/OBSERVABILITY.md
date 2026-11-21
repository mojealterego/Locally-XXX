# ENT-29 — Local tenant-scoped audit and observability

Status: **PARTIAL**. Node.js >=22.16.0, private local SQLite. No central OpenTelemetry pipeline, multi-node replication or production integration is claimed.

## Contracts

- `src/observability/ledger.mjs`: append-only application API with exact field allowlist `tenant, agent, runId, kind, node`. Event kinds are `run_started`, `tool_allowed`, `tool_denied`, `tool_finished`, `tool_failed`, `run_finished`, `run_failed`. Neither tool arguments, outputs, prompts, credentials nor private model reasoning enter the ledger.
- SQLite `synchronous=FULL`, transaction-based, per-tenant keyed HMAC-SHA-256 chain; the verification check detects changes to recorded history while the 32-byte HMAC key remains confidential. Readers verify tenant history before serving entries. `MAX(seq)` and an atomic tenant_state update serialize writers on the same local SQLite filesystem. The ledger is not immutable against an attacker who can remove the entire database and state or steal the key. Retain independent external signed checkpoints for stronger forensic guarantees.
- `graph-runner.mjs` optionally emits stage/status events via a trusted eventSink; `agent-runtime.mjs` accepts `audit: AuditLedger` and forwards validated event structures. When audit is configured, append failure rejects graph execution rather than ignoring the audit gap. Existing non-audited callers remain compatible.
- `src/observability/http.mjs` exposes `POST /api/audit/list` and `POST /api/audit/stream` (SSE). Both require a valid OIDC Bearer access token plus PDP permission `read` for the requested agent under the authenticated tenant. The JSON request shape is exactly `{"agent":"agent-a","since":0,"limit":100}`, maximum 200 per page; tenant is derived from the identity, never from user data. SSE emits `id`, `event: audit`, heartbeats, and a bounded session; connection limits and a no-backpressure-buffer policy are in place. No hidden chain-of-thought is collected or surfaced.

## Setup (operator-managed)

Create an owner-only directory (0700) for the ledger and an **external** owner-only 32-byte HMAC key file (0600). Do not put the key in Git, public ZIPs, browser storage or environment variables.

Set `OMEGA_AUDIT_DIRECTORY`, `OMEGA_AUDIT_HMAC_KEY_FILE`, `OMEGA_OIDC_ISSUER`, `OMEGA_OIDC_AUDIENCE`, `OMEGA_OIDC_CLIENT`, `OMEGA_PDP_URL`, `OMEGA_PDP_KEY_FILE`. Optional: `AUDIT_PORT` (default 3003, localhost only), `AUDIT_MAX_EVENTS_PER_TENANT` (default 50,000; hard ceiling 1,000,000). Launch from `backend/` with `npm run start:audit`. The server does not receive credentials through URL parameters.

For a trusted runtime process, construct an `AuditLedger` using the same key and filesystem, then inject it into `createAgentRuntime({..., audit: ledger})`. Do **not** let a remote caller choose the audit handler. This integration adapter is opt-in; the current review workflow and other separate services are not automatically instrumented. The backend audit endpoint is now routed through the same-origin browser proxy (fixed loopback AUDIT_PORT), but there is no audited UI panel or production login flow.

Do not expose the audit listener directly on an external network. A production remote gateway requires ZTNA, TLS, session binding, replay control, retention policy, centralized immutable storage, explicit key rotation and recovery procedures.

## Verification and limitations

`npm run test:audit` (Node built-in test runner) covers AUD-01..13 with real SQLite, local HTTP, existing graph runtime, and real SearchGateway/GvisorRunner implementations with a synthetic fetch adapter. See `docs/OMEGA_ENT_OBSERVABILITY_EVIDENCE.md`. Legacy DAG functionality was checked in a focused regression. Full backend suite, full desktop/Android build, live IdP/PDP, multi-process load, chaos, and production model interactions **NOT_RUN**.

This is an explicit **incremental observability implementation**, not completion of all ENT-29 requirements. No OpenTelemetry exporter, centralized tenancy-aware event store, durable cross-process fanout, RBAC administration panel, event archives, retention or legal hold is implemented.

## Same-origin web proxy (APX-01..04)

The integrated web server proxies only `POST /api/audit/list` and `POST /api/audit/stream` to the fixed `http://127.0.0.1:AUDIT_PORT` address (default 3003). Requests require the configured same-origin `Origin`, valid Bearer header shape and `application/json`. Requests are capped at 4096 bytes. The stream is forwarded with SSE media-type check, 2 MiB response cap, timeout and client-disconnect propagation. Browser cookies or arbitrary headers are **not forwarded**. The backend independently verifies OIDC and PDP. `WEB_PORT` is validated at audit-service startup and used for the allowed origin list. Existing Cloud/Review endpoints remain separate. There is no frontend UI for reading these events yet.

Run `npm run test:audit` (17 local tests: AUD-01..13 and APX-01..04), no real OIDC/PDP or external APIs. Full browser E2E remains NOT_RUN; the existing Cloud proxy tests CLD-18/19 also PASS locally with synthetic static dist fixtures (no real frontend build).
