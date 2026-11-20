# ENT-19 / ENT-20 / ENT-30 — 2026-11-20
Base main: 772e02c2978cddefaf894b79c830ec384ab9a872. Branch: main. No paid CI, no second APK.

## Implementation and trust boundaries
ENT-19: Additive existing Tauri MainActivity overlay. Native Android Agent panel is read-only device_status after operator dialog; reports available RAM, thermal status, battery and heavy-work admission. No exported service, shell, arbitrary file access, network calls or new Android permissions. Existing installer accepts previous canonical Activity; new Kotlin files are generated in the same package. Android SDK and real UI are NOT_RUN. Rust, UniFFI, Zenoh, OCAF adapter, signer verification, device tests are OPEN.

ENT-20: Local GitCodespace (not GitHub-hosted Codespaces) reads a full pinned SHA only. /usr/bin/git execFile fixed argv, no shell, fixed environment, 5s timeout, 512 files and 256KiB/file limits; excludes symlinks/submodules, unsafe paths and binary. Verifies Git blob digest, UTF-8. Read-only CLI list/read/bundle. Bundle max64 files/2MiB, SHA-256 per file; browser imported workspace checks digest and requests explicit replacement consent. No Git write, push, execution, terminal, cloud workspace or Actions integration. Trusted operator chooses local repository. OS-level isolation of malicious repositories and concurrent races still require hardening.

ENT-30: Typed visual graph of screens, headings, text, navigation buttons; bounded project/nodes/edges and labels; TypeScript Compiler API creates AST and prints React component, no string injection, eval or arbitrary JS. SHA-256 source and graph, deterministic filenames per project in CLI JSON. Browser form editor / DOM preview / JSON export. React Flow, real React 19 typecheck/browser E2E and target builds OPEN.

## Tests actually run (local isolated checkout)
Node 22.16.0; TypeScript 5.8.3; Git 2.47.3; Kotlin JVM. No cargo, Rust, Android SDK, pnpm or Chromium GUI available.
RED: node --test test/visual.test.mjs and test/codespace.test.mjs before implementation exited 1.
GREEN: node --test test/*.test.mjs — 11/11 PASS, zero failures/skips. Five AST tests: deterministic source, JSX-safe literal and simulated React navigation, invalid graphs and bounds, real CLI subprocess. Six Codespace tests: real local Git repo and committed snapshot, immutable commit despite HEAD move, symlink/path/binary rejection, no worktree writes, CLI bundle import SHA-256, duplicate and tampered file rejection.
Node syntax checks on four new modules — PASS.
Kotlin core: kotlinc OmegaMobileAgent.kt OmegaMobileAgentTest.kt -include-runtime and java -jar — PASS (read-only approval and telemetry validation).
Node test stdout log SHA-256: cb2ab79c72907d7447d472ddf95867581e93f2bfe546ed2270fa438a02c431da.

Prior Android JVM suite, generated overlay install tests, real Android compiler, Tauri/Gradle, full backend/web regression tests and browser UI E2E NOT_RUN. Kotlin fixture for UI is only a substitute for unavailable Android SDK, not physical UI verification.

## Source Git blob identifiers (same as local tested files)
visual-compiler.mjs 1aa6c5682c9bbe00daf1813b6155770641c7d8df
compile-app.mjs a8199deeb671608c7c5d4e443fc9c79aef16240b
codespace.mjs dd3ca73eb0b6cd47aa25203703ac23fbb7e62435
codespace-cli.mjs 8d8ee0d5a09bbe07fec4d7ca1a7664e7a53bae36
codespace-bundle.mjs 2670855524e4753f8047123f8b81821cfb914e4c
builder.mjs 186c47999f4355d4606a0b94e16fb745b29b536b
test/visual.test.mjs 7dfb57442a4bba4a62bd5a3818a19ac11053652b
test/codespace.test.mjs 9c274a5aacc95c497269031f1be0de61eab046df
Android Activity 6ce26b39e26921f3065b1da3c8a66068fcccf1b1
Android overlay installer 7150481a446227d3dc08e2de9df864eb46310b34
Mobile agent Kotlin f22aa9dd045d7ed426f53075d5bd7443273e53d3
Native status panel 651b046ab66da7c93bea1ec02c8c191440b5435a
Android policy test 5844f885004988ebdfb5100c446f83555c424910

Verdict: local test subset GATE-04 PASS; ENT-19/20/30 PARTIAL. No physical integration evidence and no final GATE-09.
