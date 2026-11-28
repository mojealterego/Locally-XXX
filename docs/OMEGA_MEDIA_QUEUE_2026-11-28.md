# OMEGA media queue — 2026-11-28

Base: 1db34aaab78a696209c1d675ff7f4f2c72fa91ec. Scope: local Enterprise web mode, no paid CI; only main.
Status: IMPLEMENTED + scoped HOST-TESTED / PARTIAL INTEGRATION. ENT-32/33 and GATE-09 remain OPEN.

## Scope
Separate opt-in unified image/video SQLite queue; immutable graph versions with SHA-256; declared VRAM best-fit with FIFO; unique port and occupied-worker constraint; durable token, expiry and UNKNOWN quarantine; manual execution/acknowledgement; bounded ComfyUI POST /prompt, GET /history/{id}, GET /view with no application-level resubmit; local CLI registry/worker enable-disable; PL/EN Video Studio panel; legacy direct route blocked in media mode. No migration of old image database. Operator must reconcile old jobs before switching and dedicate one physical GPU per distinct worker; declarations are not measured. Graphs/custom nodes trusted and operator-reviewed only. No remote endpoints, no automatic scheduler, no live telemetry, no recovery by remote query, no purge, no encryption, no multi-tenant identity, no full media decode.

## Evidence
Environment: Linux, Node 22.16.0, node:sqlite experimental, isolated source files (full checkout blocked by DNS). Command from Enterprise root: node --test test/media-queue.test.mjs.
RED: module absent, ERR_MODULE_NOT_FOUND (not six individual failing assertions).
GREEN: six tests, six PASS, zero fail, duration 347.169942 ms.
- MQ-01 immutable version, idempotent enqueue, reopen.
- MQ-02 capacity selection, two distinct logical workers, duplicate endpoint rejection, durable token fencing.
- MQ-03 virtual clock expiry, UNKNOWN quarantine, manual acknowledgement and stale token rejection.
- MQ-04 disable/cancel/invalid artifact/invalid graph reference.
- MQ-05 real HTTP loopback to deterministic contract server: one submission, prompt binding, history, view, retained output.
- MQ-06 real local HTTP: origin denial, explicit approval, output retrieval (controlled runner).

Production module blob 5b8724d2492e83fb720775ddaebe75c12ce80f2b; test blob 48388a04feb596eb0e862167389b70a713423d9a. Native logs SHA-256 RED b0239656e8e18e9938199c445b04d779b5ad51df5625899f126d2e8680fc5d42; GREEN d8c071fcd2240c5d0e20fc7bc595acf53a4258485f47f8f9f631ea9966f5ae56.
CLI smoke: three separate processes registered worker, registered workflow and listed persisted rows; syntax checks on new modules PASS. CLI blob c7fb67cac76aff433e632598206f6a83d62cb538; browser blob 238d8e7e572297600473e4995ac2537404414bac.
MP4 test fixture contains top-level boxes only, not a decodable video; no image execution test. Test transport does not execute a real graph or GPU. Reference API: https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/websockets_api_example.py .

## Gate
GATE-01 scoped requirements defined; GATE-02/03 partial (web wiring source, no complete product); GATE-04 targeted 6/6 PASS, full regression NOT_RUN; GATE-05 partial contract HTTP only; GATE-06 partial local boundary checks, no adversarial full audit; GATE-07 partial virtual clock/reopen; GATE-08 scoped evidence; GATE-09 OPEN. Native ComfyUI, real model, image workflow execution, GPU/VRAM measurement, full web build/browser E2E, Android, deployment and production validation NOT_RUN.
