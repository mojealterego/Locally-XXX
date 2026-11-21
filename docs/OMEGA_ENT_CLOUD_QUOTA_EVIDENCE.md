# ENT-44/46 — QTA-01..10: cloud quota verification

Date: 2026-11-21. Base main SHA: edd9793187b3807ca0ef783c4be236464ab2cf49. New scope: per-tenant daily request and maximum output-token reservations, enforced before any outbound cloud request.

## Local evidence

Environment: Linux, Node.js v22.16.0 with experimental built-in node:sqlite, no third-party dependencies downloaded for new tests.

RED: node --test test/cloud-quota.test.mjs initially failed because the CloudQuota implementation did not exist (ERR_MODULE_NOT_FOUND).

GREEN: node --test test/cloud-quota.test.mjs test/cloud-http-quota.test.mjs — 10 tests PASS, 0 FAIL. Covered request/output quotas, persistence over reopening, two concurrent database handles, UTC daily reset, tenant validation, strict configuration, private file permissions, input validation and local HTTP admission. QTA-10 used an actual localhost HTTP listener and a synthetic provider: the third call returned 403 without entering the stream handler.

Verified SHA-256 (new source):
- src/cloud/quota.mjs: 28e5666a5442fea74dad0ff25ee9323a01ebf903290801b5fdfe786e3b0a7393
- test/cloud-quota.test.mjs: 721f9a5a4058fd05c788915767f4db0cc5602bc0619df7bf265184f0d49de54f
- test/cloud-http-quota.test.mjs: 59a5a22e3135ef7215d3eb887f83fc02d84b81617ca253bdf337c2a1b7a20adb

The patched HTTP source Git blob SHA matched the locally tested source (04c160cdb1894a6737e42ed0adfde27f9601a848). New module and tests Git blob SHA also matched their locally executed copies.

## Limitations and release gates

The repository was read through the authorized GitHub connection; git clone into the local runner was impossible (DNS resolution failure), so a minimal local copy of the cloud policy and gateway was used to exercise the new code. The full pre-existing backend regression suite and application build were not executed, and the upstream policy replica was not verified byte-for-byte. No real Keycloak, Permit, provider, billed usage, browser E2E, Tauri/Android, high-availability failover or physical device test was executed.

The SQLite ledger is durable on a supported single-host filesystem with a trustworthy UTC clock. Request and reserved-output-token limits are **not financial cost guarantees**, and cannot account for input-token charges or changing provider pricing. Multi-node budgets, actual bills and reconciliation are OPEN. QTA local functional tests: PASS. ENT-44/46 and global GATE-09: PARTIAL/OPEN.
