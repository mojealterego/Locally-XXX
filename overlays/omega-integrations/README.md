# OMEGA Incremental Integration — Locally-XXX `main`

This **real integration increment** reuses user-supplied, separately tested reference source packages instead of inventing another orchestration engine. The **working, exercised runtime bridge** is `bridge.mjs` (Aether Studio control plane + P10 Cinema). Other 10 reference components are vendored as isolated, pinned, testable packages but **are not wired to the application runtime**. All modules remain opt-in. This is **not** a functioning AAA renderer, GPU inference backend or Android application.

Requirements: Node.js >=22, Python >=3.11, and for full suite: pytest 9, numpy 2, Pillow 12, cryptography 46, jsonschema 4. Actual locally used versions are in test evidence. Native dependencies are **not vendored**.

Quick start from repo root:

```bash
python3 overlays/omega-integrations/verify.py
node overlays/omega-integrations/cli.mjs overlays/omega-integrations/examples/integrated-production-request.json
```

`bridge.mjs` validates both independently defined project types, maps P10 shot assets with verified hashes and rights attestations, rejects child/adult boundary violations, checks the narrative graphs, constructs P10 shot manifests and an Aether musical transition plan, and returns a content-addressed **PLAN_ONLY_NOT_BUILT** manifest. An optional adapter execution API requires explicit approval and an evidence bundle, and **labels external claims as claims rather than proof**. Real build/render/publish operations are absent.

`SOURCE_LOCK.json` contains the SHA-256 of every imported file. The verifier checks those hashes before running tests. New source revisions must be reviewed and relocked deliberately; do not silently modify third-party files in place. Original AGPL-3.0-only attribution must be maintained and source licenses re-audited before redistribution beyond this repository.

See `INTEGRATION_MATRIX.md` for the boundary of every referenced subsystem and remaining GATE-09 blockers. No automatic SaaS, GPU, P2P, camera or network activity is performed.
