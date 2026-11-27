# ENT-49 / PDF wiring — 2026-11-27

Base commit: 774c666f3df093aa378aeb01329c827fe9bb4b08. Branch main only. No paid CI. Four static source checks executed against the base and edited content: PDF-WIRE-01 catalog, 02 launcher mount, 03 build mapping, 04 static serving and HTTP dispatch. RED 4 failures, GREEN 4 passes. No browser execution claimed.

Native HTTP integration: locally reconstructed source files checked using Git blob SHA:
- pdf-http.mjs 219b3195f3db7bf2e2836b428d3c8ffd97b7603d
- pdf-runner.mjs 7611e66ad832350730cbaab8e04e81127ea5d409
- html.mjs b301d4ff9479625a03f1bba53c11b2f571af202e
- pdf_report.py 7bf34ee03e63214532e8c1f46e96a9839ccb626f

Linux / Node 22.16.0 / Python ReportLab 4.4.9, actual loopback TCP and renderer, no mock. One node:test case with 6 HTTP scenarios PASS: nominal PDF, reproducible PDF, foreign origin 403, invalid schema 400, GET 405, oversized 413. Test blob 4afc92e964aae76fb9da2ee5b402efc5f73003e6. Log SHA-256 f29f7c49cca5137acaaa62dd16880e0c26992f4d58032437bbf3caa210e7c79c. Reproduce from Enterprise root: npm run test:pdf after installing existing printer requirements and a local Unicode TTF. The dedicated test is not in the default offline UI glob because it needs ReportLab and loopback sockets.

Scope: renderer/endpoint native tested; wiring static checked. Full app checkout/build/GUI E2E not executed (GitHub DNS unavailable in local container); Android and signing not executed. ENT-49 PARTIAL, GATE-09 OPEN. Catalog entry indicates implementation wiring, not health of Python/font installation.
