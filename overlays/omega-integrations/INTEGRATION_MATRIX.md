# Integration matrix — release gate evidence

Date: 2026-11-23; repository `mojealterego/Locally-XXX`, branch **main only**. Earlier packages were local artifacts, not commits in this repo. All below are imported as **source**, not assumed production-deployed binaries.

| Original decision/package | New path `modules/` | Functional integration | Further work |
|---|---|---|---|
| Aether Studio AS-2026 | `studio/` | **Node bridge live**: project validation, narrative graph, adaptive audio | Director Dashboard UI, renderer/engine adapters, genuine E2E |
| P10 Cinema/Animation/AAA | `cinema/` | **Node bridge live**: shot manifests, role catalogue, narrative QA, readiness | Godot/Unreal/Aether adapter, film editing/render |
| P09 Firefly | `firefly/` | Source and CPU code imported + tests; **not connected** to UI/bridge | Shared asset registry, image masks and true media E2E |
| QFV v11 | `qfv/` | Source imported + tests, **not connected** | GPU/Android, capture adapters and facial-rig interchange |
| ATM | `atm/` | Reference reasoning source imported, **not connected** | Proof gateway / policy decision service |
| OTCM | `otcm/` | Four-temporal reference memory source imported, **not connected** | Integrate through OCX, do not duplicate production database |
| AETHR | `aethr/` | `.oxa`/routing/tenant cache source imported, **not connected** | Real GGUF/backend execution and dedicated resource arbiter |
| Inference Gateway | `inference/` | Routing reference imported + tests, **not connected** | Bind to existing llama.cpp/Ollama/LLM manager |
| Attention/PEFT | `attention/` | Planner source imported + tests, **not connected** | HPC-only remote runners and real GPU training |
| Mobile Sovereign Runtime | `mobile/` | Policy source imported + tests, **not connected** | Android native packaging and thermal/memory signals |
| HAEE | `haee/` | Contracts + tests imported, **not connected** | DGM/RSI experiments under separate workflow |
| OmegOS/Continuum | `omegos/` | Formal obligation schemas and tests imported, **not connected** | Real trusted checker/prover; no fabricated proof evidence |

**Explicitly NOT integrated:** OCX core storage, Aether Engine runtime, proprietary media/video APIs, quantum/neuromorphic hardware, physical S24 Ultra, ComfyUI/Unreal/Godot runtimes. These require live adapters, explicit authority and actual integration tests.

**Gate status:** GATE-01 partial; GATE-02 partial; GATE-03 partial; GATE-04 passes only the local modelled subset; GATE-05/06/07 partial or blocked; GATE-08 partial; **GATE-09 BLOCKED**. Node and Python host tests cannot be presented as app E2E or GPU validation. No changes to pinned upstream files under `migration/staged` or `upstream/`.

## Continuation order (without duplication)

1. Bind `studio` and `cinema` to existing source-verified Tauri/React commands and real project store.
2. Bind P09 `ElementRegistry` to the existing asset store, then QFV via typed `FacialRigManifest`.
3. Integrate ATM/OTCM/OmegOS through the existing OCX/Policy abstractions and audit traces.
4. Route AETHR/inference/mobile/attention through the existing resource arbiter and explicit cloud opt-ins.
5. Integrate Aether Engine/Godot/Unreal/ComfyUI only after an executable backend and real asset evidence exist.
