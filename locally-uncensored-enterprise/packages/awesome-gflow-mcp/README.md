# Awesome GFlow MCP — Sovereign Film Studio / Vertex Veo Bridge

**Status: ENT-50 PARTIAL (2026-11-21). No production deployment, paid generation, Google Flow private API integration or real provider E2E.** This package implements a local scene compiler, a bounded offline MCP stdio server and an opt-in **first-party Vertex AI Veo 3.1** REST adapter. It is not a claim that Google Flow provides an official public API.

## Confirmed APIs (primary sources)

The documented Google Cloud video APIs use:

- `POST https://us-central1-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/us-central1/publishers/google/models/{MODEL_ID}:predictLongRunning`
- `POST https://us-central1-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/us-central1/publishers/google/models/{MODEL_ID}:fetchPredictOperation`, with JSON body `{ "operationName": "projects/.../operations/..." }`
- OAuth Bearer token for a suitably authorized Google Cloud identity; generated output can be a `gs://` URI. Verified models on the accessed documentation are `veo-3.1-generate-001` and `veo-3.1-fast-generate-001`; availability, quota, release stage and cost must be rechecked for each deployed project/region.

Source: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-text and https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate .

**Nonexistent/unverified APIs are NOT used:** the prompt's `/v1/google-flow/videos`, `/v1/google-flow/characters`, `/v1/projects/videos:generate`, `clientContext.recaptchaContext`, and arbitrary `GET /jobs/{id}` cannot be assumed to belong to a supported official Google Flow API. Third-party providers such as useapi.net are separate services requiring their own security and licensing review. This adapter does not extract web cookies, automate solving reCAPTCHA, bypass moderation or manipulate Google Flow's private DOM.

## Master Prompt schema (v1)

```json
{
  "version": 1,
  "projectId": "studio-project-123",
  "metadata": {
    "model": "veo-3.1-generate-001",
    "aspectRatio": "16:9",
    "storageUri": "gs://my-film-bucket/shots/",
    "classification": "public"
  },
  "entities": [
    {"id": "hero", "name": "Marta", "visualDescription": "Brown coat and dark hair"}
  ],
  "scenes": [
    {"id": "shot-1", "durationSeconds": 8, "actionPrompt": "Dolly zoom follows @hero across street"}
  ]
}
```

The compiler validates all keys and bounds, rejects unknown entity tags, duplicate IDs, common credential patterns and non-public classification, and returns a SHA-256 digest of the canonical scene. Entity descriptors provide **textual** continuity; they are NOT Google-hosted character IDs and do not guarantee face consistency. Reference-image upload, Ingredients/Frames media ingestion, true video extension and 4K upscaling remain separate unimplemented contracts. No source image is automatically uploaded.

## Usage

From `locally-uncensored-enterprise/`:

```sh
node --test packages/awesome-gflow-mcp/test/*.test.mjs
node packages/awesome-gflow-mcp/bin/flow-mcp.mjs
```

The MCP stdio protocol provides `initialize`, `ping`, `tools/list`, `tools/call`. Only `flow_compile_master_prompt` executes in standalone mode; `flow_generate_scene` and `flow_poll_scene` are reserved tool contracts that **deny by default** rather than pretending that a paid API operation happened. To integrate with a trusted enterprise backend, instantiate `FlowJobs({directory,dailyLimit})`, `VertexVeo({enabled:true,tokenProvider})`, and `FlowStudio({jobs,provider,authorize})` after real authentication, project allowlisting, fresh operator approval, approved storageUri, daily quota and auditable permission checks. Do not provide a permissive `authorize` in production. Tokens must be supplied by an externally managed short-lived OAuth provider and must never be written into SQLite, logs, shell history, browser storage, or user prompts.

The external integration uses **fixed HTTPS Google endpoints**, `redirect:'error'`, a bounded response reader, timeouts, strict model and operation-name validation; no user-provided URL is fetched. GCS URI is a result reference, **never automatically fetched**. Any future download path must implement separately reviewed IP/TLS/network policy. The underlying gateway requires independent IAM/tenant binding, egress policy and real consent (not a model-generated boolean).

## Durable semantics and quota

`FlowJobs` stores per-tenant idempotency key, manifest digest, model, storage prefix, status, provider operation identifier and optional approved output URI in local private SQLite (`0700` directory, `0600` db, `PRAGMA synchronous=FULL`). It never stores the prompt or API token. A reservation occurs atomically with a daily per-tenant request limit. States: `SUBMITTING → SUBMITTED → RUNNING → SUCCEEDED/FAILED`; ambiguous submissions become `UNKNOWN` and **do not auto-resubmit**. Human reconciliation/repair remains OPEN. The counter intentionally charges aborted, failed and ambiguous starts to avoid unbounded billing retries. This is NOT a monetary budget; live input/output charges are not calculated. Local SQLite is not multi-host HA.

Polling is bounded (maximum 20 attempts, configurable exponential delay; HTTP 429 retry applies only to polling). Provider refusals and safety filtering are terminal; no prompt rewriting to bypass policy. Exactly one validated MP4 GCS artifact URI is currently accepted; multi-sample outputs need a later versioned contract. The operator must ensure that the configured GCS bucket is an authorized project resource with explicit retention and lifecycle policies.

## Tests and gaps

`node --test test/flow.test.mjs` on Node 22.16.0: 21/21 PASS with real local SQLite, two database connections and mock provider HTTP responses; a real subprocess tests stdio MCP. No external Google Cloud request or bill was issued. Production gates still required: real IAM/OIDC/PDP integration; operator consent UI; secure OAuth refresh; backend lifecycle and scheduler; authoritative billing; callback signature and GCS access verification; centralized multi-host durability; signed immutable audit; source-media consent; browser/desktop/mobile E2E; compatible official image/video APIs; load/chaos and retention compliance. **GATE-09 OPEN.**
