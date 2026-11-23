# OMEGA Incremental Integration — Locally-XXX `main`

This **real integration increment** reuses user-supplied, separately tested reference source packages instead of inventing another orchestration engine. The **working, exercised runtime bridge** is `bridge.mjs` (Aether Studio control plane + P10 Cinema). The new bridges directly compose reference modules (including experiments); **none is wired into the full Tauri application runtime yet**. All modules remain opt-in. This is **not** a functioning AAA renderer, GPU inference backend or Android application.

Requirements: Node.js >=22, Python >=3.11, and for full suite: pytest 9, numpy 2, Pillow 12, cryptography 46, jsonschema 4. Actual locally used versions are in test evidence. Native dependencies are **not vendored**.

Quick start from repo root:

```bash
python3 overlays/omega-integrations/verify.py
node overlays/omega-integrations/cli.mjs overlays/omega-integrations/examples/integrated-production-request.json
```

`bridge.mjs` validates both independently defined project types, maps P10 shot assets with verified hashes and rights attestations, rejects child/adult boundary violations, checks the narrative graphs, constructs P10 shot manifests and an Aether musical transition plan, and returns a content-addressed **PLAN_ONLY_NOT_BUILT** manifest. An optional adapter execution API requires explicit approval and an evidence bundle, and **labels external claims as claims rather than proof**. Real build/render/publish operations are absent.

`SOURCE_LOCK.json` contains the SHA-256 of every imported file. The verifier checks those hashes before running tests. New source revisions must be reviewed and relocked deliberately; do not silently modify third-party files in place. Original AGPL-3.0-only attribution must be maintained and source licenses re-audited before redistribution beyond this repository.

See `INTEGRATION_MATRIX.md` for the boundary of every referenced subsystem and remaining GATE-09 blockers. No automatic SaaS, GPU, P2P, camera or network activity is performed.

## P09↔QFV CPU media stage (second increment)

Run `python3 overlays/omega-integrations/media_bridge.py < overlays/omega-integrations/examples/media-preview.json`. This strict JSON-in/JSON-out, no-network bridge checks managed references (1–5), owner/project scope, preserved `@mentions` and executes **actual QFV CPU vector-field deformation** on bounded geometry. It returns `CPU_REFERENCE_PREVIEW_NO_VIDEO_RENDER`; no video, face recognition, rasterized image, GPU, persistent asset catalog or native Android support.

## Inference Gateway ↔ Mobile resource admission (third increment)

Run `python3 overlays/omega-integrations/examples/compute_demo.py`. `compute_bridge.py` composes the genuine reference admission functions from Inference Gateway and Mobile Sovereign policy. It refuses mismatched budgets, tenant principals, mode upgrades, cloud usage without separate authenticated grants and remote transfer of private/restricted data. The result is **ROUTE_PLAN_ONLY** and does not start llama.cpp or a network connection. The caller must authenticate principal/grants and supply trustworthy device telemetry; unverified client-provided grants are not sufficient.

## OTCM → ATM → OmegOS knowledge/proof bridge (fourth increment)

Run `python3 overlays/omega-integrations/examples/knowledge_demo.py`. The actual OTCM event model is used to replay temporal records; ATM Belnap logic computes contradictions without explosion. The gate does **not** accept an unverified proof and never executes a tool. `validate_omegos_obligation` validates the original OmegOS JSON Schema, but does not run a solver or claim a proof. This module uses in-memory SQLite only and forbids implicit sharing; production requires authenticated tenant identity and OCX persistence integration. Future effective dates not supported by ATM's current evidence contract are explicitly rejected, not silently reinterpreted.

## Attention/PEFT → HAEE → AETHR .oxa experiment plan (fifth increment)

Run `python3 overlays/omega-integrations/examples/experiment_demo.py`.
`experiment_bridge.py` composes the **real Attention planner** and **HAEE 1.0.0 JSON Schema**, enforcing tenant, budget, mode, privacy and cloud-consent boundaries. A strictly checked plan may be packaged as a signed `.oxa` DATA artifact using the real AETHR OXA1 Ed25519 code and verified with a **separately trusted public key**. The example creates an ephemeral demo key in memory; never use this as a production trust anchor. Result `PLAN_ONLY_NOT_TRAINED`, not trained/evaluated. No optimizer, GPU, runtime worker, self-modification, paid cloud workload, or automatic promotion is invoked.
