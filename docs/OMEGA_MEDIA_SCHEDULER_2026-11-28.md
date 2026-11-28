# OMEGA media scheduler and history recovery — 2026-11-28

Base: 987d9544d11ecf9ef5236e80a84fd282a4af334f. Scope: MEDIA-12 automatic local dispatch; MEDIA-16 successful history recovery only. IMPLEMENTED / scoped HOST-TESTED / PARTIAL INTEGRATION.

## Design
Atomic claimNext reuses manual reservation under SQLite BEGIN IMMEDIATE, persists expiry even when no worker is eligible, and preserves strict FIFO/best-fit declared VRAM. Separate opt-in scheduler process, 1–16 in-flight tasks per process, one per logical worker across DB connections, no automatic retry. SIGINT/SIGTERM stops new work and aborts local waiting; failures remain UNKNOWN. History recovery uses the existing bounded artifact validator and GET only, with transactional state/worker recheck; no resubmission, no inferred cancellation. The process is explicitly authorized to run all current and future queued jobs by operator flag. This is not per-job approval or a global concurrency budget. Dedicated trusted backends and one logical worker per physical GPU remain prerequisites.

## Verification
Linux, Node 22.16.0, native node:sqlite (experimental), exact isolated baseline source blobs; full checkout blocked by DNS. RED: node --test test/media-scheduler.test.mjs failed on missing module (not five individual assertions). GREEN: node --test test/media-queue.test.mjs test/media-scheduler.test.mjs, 11/11 PASS, 0 failures, 293.697851 ms. MQ-01..06 regression all PASS.
- MS-01: parallel FIFO, cross-connection exclusion, next dispatch.
- MS-02: failed worker quarantined, healthy worker progresses without duplicate execution.
- MS-03: abort shutdown, UNKNOWN persists, queued job untouched.
- MS-04: actual loopback HTTP GET-only successful history recovery, persisted artifact.
- MS-05: missing history and competing manual acknowledgement leave state fail-closed.
CLI smoke: actual separate process started on empty private database, received SIGTERM, exited successfully with MEDIA_SCHEDULER_STOPPED. Syntax checks on all three production modules PASS.
Source blobs: queue 0f6d8adccca07b641e365dae59112d3ea4b64464; scheduler c535bfc5328562fdc3192c32b618cb4ced086911; CLI 6399aea2cacc03e472f45f149fc825c9bc6ad155; test 5ef8650cf4a42da298db6ae918b545d80c3ad7a6.
Log SHA-256: RED 77ebc5bb0b23d67e35f34422ae312194198f65bc95c26f4810a2615ac7150027; GREEN 47701d73ff81c2d705a32cd0e32da59b45b94a7f951b91ede41920786e338708; CLI 7a0ba4c534f4e8301f73c6ff90a09356df69d2ca655495f5b8ccae7ead545ce0.
Simulation uses controlled transport, synthetic PNG header and MP4 boxes, not decodable media or live GPU. Concurrent scheduler test uses two SQLite connections in one process; no multi-process load benchmark. Actual scheduler daemon smoke had no jobs. Full build, all repository tests, real ComfyUI/GPU, Android, browser E2E, automatic failure reconciliation, streaming progress, telemetry, retention and migration NOT_RUN or OPEN. GATE-09 remains OPEN.
