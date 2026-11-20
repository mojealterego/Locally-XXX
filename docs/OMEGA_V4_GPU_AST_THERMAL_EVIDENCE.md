# V4-GPU / V4-AST / V4-THERMAL + Enterprise — evidence

Base: 6cd018e6dac670a7537551ea5c9092154145172e. Date 2026-11-20. Environment Linux, Node v22.16.0, TypeScript 5.8.3, Python 3.13.5, Kotlin/JVM 1.9.0 and JDK 21. No Rust/cargo, Android SDK/device, PostgreSQL, Docker or pnpm integration run. No full upstream checkout/build; no paid CI.

| Suite | Command run | Result | SHA-256 of output |
|---|---|---|---|
| KV handoff | python3 -m unittest discover -s tests -p test_kv_handoff.py -v | 6/6 | 818508645ef715f5b660808bad1a672f7b912bdb05d27cf9d069fee1c31caf8e |
| AST | NODE_PATH=$(npm root -g) node --test tests/ast-index.test.mjs | 5/5 | e6bea7c48aca08b3c670e99a739b314f4aafb2485ba73628c38dec5209e2c451 |
| Kotlin thermal | python3 scripts/test-thermal.py | 2 executable JVM scenarios, PASS | d36f03841de5954a3ef6d740324cfdc7b2a40f9cd7fc2d3c7e8186c6b5e490d0 |
| Android lifecycle regression | python3 tests/android-jvm.py | 8/8 | bd58916171a3e2e901149b51eda0ff89f50d58b57c1213c4551a62dec0c13596 |
| Enterprise SDK | npm --prefix locally-uncensored-enterprise/packages/agent-sdk test | 7/7 + tsc | 3d7132806b08f9dd270f82dbd2b83f56105c1d51b3cf9d3142ec2109dfd5b128 |

Total: 20 new test cases/scenarios, 8 regression cases. YAML parsed and private-network/no-port checks passed separately (not docker compose validation). Android fixture compilation initially failed due Kotlin generic smart cast; fixed generic service lookup and reran successfully.

Source blob IDs:
- scripts/kv_handoff.py 566539fbfcbf0989f7a9eedabc3817b92178f195; tests/test_kv_handoff.py 1aa7c0604ee83572bb0f5b24014832dfb9e3da3c
- scripts/ast-index.mjs 6d645c2d2de87d2a9c9997bb78414b20f1bf0a44; tests/ast-index.test.mjs e94affc4911cf9a514d898171b22f93a0a729179
- overlays/android/OmegaThermalGate.kt c9a06205e9d31475dc155d5b717a74c2bb596ecd; OmegaThermalMonitor.kt 35c9ca51469d9e606814f9598c7a1541ab60aa4f; MainActivity.kt c6286306318a0f82d5cec61f2fb00f53289d2597
- tests/ThermalTest.kt 1a40471facd1f2b55dc7b734045d66ae6ecc7112; tests/ThermalMonitorTest.kt fb70ea297a256e5d6959b4cbed2e51b1c1c5f257; tests/android-jvm/TauriFixture.kt 2d4c1c010be0f9bf2746181b0f40f9a9d59781c3
- Enterprise graph.ts e67f4a4b88d9616bfa453a8ea889667815b245e6; graph.test.mjs b18671ca9f68caf41e0d1a7b6eb2231786a1c0b4; SQL 97708c2630fc05d47fa4b7e2f4e0cc907df0b1c0; Compose f2847f62f468ecf61c8728f1c590af7300bb0d50

RED output hashes: KV dc54a7addca23d6907312626a172f14e8d25bf3b36cb5490d314dcce4ba0be9e; AST 1db9fc28fc9149e9f1c7f908f27233947d332c8396bc526a91b61bf968b87e44; thermal 5856f80217e33be9e0eb4ccfa936927f486c71d4ecaef7a4c4509c7106287414; SDK b1d4a95dc00414455063c4c744b3d279c4d0c64150fe2b9147896d3451bcc65a.

## Boundaries

- KV: actual local HTTP roundtrip to deterministic fixture, not actual llama-server. Requires operator-owned exclusive single-slot server, same engine/model/context/scope and private shared cache directory. SHA-256 checks file bytes and supplied metadata; does not attest server or authenticate tenant. Existing Tauri kv_slot_action remains separate and unmodified. Quantization compatibility, cancellation and automatic handoff remain open. No model performance claims.
- AST: real TS compiler API, static relative import graph, deterministic file order/hash, traversal and resource limits. No type-checking/semantic resolution, TS aliases, Rust/Tree-sitter/LSP, repo_map IPC or concurrent hostile workspace guarantee. Root dev dependency pinned to 5.8.3; install/lockfile generation and full suite not run.
- Thermal: Android APIs modeled with JVM doubles. Policy denies stale data, unsupported API, low-memory and thermal >=2; recovery requires 15 seconds below limit. One-second refresh, Activity start/stop, exposed canStartHeavyWork. Native overlay installer is updated but its full regression suite not run here. No Rust-side job execution gate or physical APK.
- Enterprise: compiler grant must originate in verified backend; no identity provider or MCP execution. DDL/Compose are source artifacts, no actual PostgreSQL/Redis authorization, initialization, container or network test. Full lockfile and deployment open.

GATE-01/02/03/04: partial at feature level, demonstrated local subset. GATE-05/06/07/08/09: partial until outstanding integration, security, recovery and release criteria are evidenced. No blanket PASS.
