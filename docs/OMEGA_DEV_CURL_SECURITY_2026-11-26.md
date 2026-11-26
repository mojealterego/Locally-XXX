# DEV — cURL generator security increment (2026-11-26)

Base main: `d4d958dbf266d3861bad95d162d97747225838ea`. Scope: offline POSIX command generation, not network execution inside DevSuite.

## Defects and implementation
- NET-06: shell quoting does not prevent curl --data-binary from treating @ as a file reference. Use --data-raw for literal request body.
- NET-07: disable implicit curl config as the first option, disable URL globbing, restrict allowed protocols to HTTP(S).
- NET-08: reject NUL in a shell argument rather than silently changing data.
- NET-09: real POSIX shell, curl and loopback HTTP endpoint, isolated temporary config and nonsecret fixture. Exactly one request, unchanged @ body, no implicit configuration header.

## Evidence
Environment: Linux x86_64, Node 22.16.0, Git 2.47.3, curl 8.10.1. NATIVE, no external network. Original blobs verified against GitHub: source e360b71420a200e005ef82cae5739c28501f548d; tests 09d44d07f5a7d325f6e77689adcf3658e2e75411.
- RED: `node --test tests/devsuite-network.test.mjs`, exit 1, 5 PASS / 3 FAIL. Log SHA-256 385e90d7cd9558797b1cdfec1dbb55fd9f187d6b1dbcf9a27766e66819662736.
- GREEN: same command, exit 0, 8 PASS / 0 FAIL / 0 SKIP. Log SHA-256 2017b9cd46edf208cee2d3ccacc6752d3e9f808213bed2ee9f03db3846504556.
- Syntax: `node --check scripts/devsuite-network.mjs`, exit 0.
- NET-09: `node tests/devsuite-curl-loopback.mjs` (host run under equivalent root layout before relocating test into tests/ and adjusting import). Exit 0. Log SHA-256 e4591ac5cbc4f3508f97486d374226ee44e0a54f5eb273836daf104fcae32689. Output: NET-09 PASS: real shell + curl + loopback; exactly one request, literal body, no implicit config header.
- Tested production blob: 6ea1793023db7cce44187385c7d7e8756825012c; unit-test blob: 839e34a0635437833076fe2fadd0f7cd0564b8aa.

## Gate scope
GATE-01/02/03/04/06: targeted implementation and regressions PASS for NET-06..08; native loopback contract NET-09 PASS in host layout. Full DevSuite suite, browser/MCP integration, full checkout/build and Android NOT_RUN. GATE-05/07/09 remain OPEN at overall DevSuite scope. This is not a general security certification; manually running generated commands may still contact network destinations, use environment proxy settings, or expose caller-supplied sensitive data. No claim of SSRF protection, production deployment or project completion. Direct Git clone was blocked by DNS in the host; targeted source/test blobs were verified exactly. No paid CI or additional branch.
