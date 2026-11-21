# ENT-51 — Omega Omniverse Android Foundation (2026-11-21)

**Status: PARTIAL / GATE-09 OPEN.** This is an incremental implementation within `mojealterego/Locally-XXX` on **main**, not a separate app and not a release build. The reference handset is Samsung Galaxy S24 Ultra. The 6,553 MiB model budget is a policy ceiling and analytical assumption; it is **not** a guarantee that Android can allocate that amount.

## Integrated production sources

- `overlays/android/OmegaMemoryLeaseBroker.kt` — in-process, synchronized reservations. Validated IDs, configurable positive budget/headroom and monotonically increasing request tickets. Deterministic choice of revocable lower-priority victims: ascending priority and lexical ID. Two-phase reclaim means no reservation is removed before the caller confirms the real workloads were unloaded and a **fresh Android memory reading** has sufficient space. A failed allocation or stale acknowledgement does not silently evict workloads. Aborted plans retain conservative accounting.
- `overlays/android/OmegaThermalMonitor.kt` — actual Android `ActivityManager.MemoryInfo` and existing `OmegaThermalGate` are used to gate prepare and confirmation. `effectiveBudget = min(6553 MiB, max(0, totalMemMiB - 5120 MiB))` is a configurable starting heuristic; `lowMemory`, thermal status, freshness/dwell and free-space guard must admit the request. The monitor offers `prepareNativeLease`, `confirmNativeLease`, `cancelNativeLease`, `releaseNativeLease` and `nativeLeaseSnapshot` for real native model clients. **No model loader currently calls these methods**.
- `overlays/android/OmegaCapabilityPolicy.kt` — an explicit, local capability policy. Quarantined agents have zero tools; empty reader ACL is denied rather than public; untrusted arguments cannot reach writes, network or signing, even with operator approval. Local device status requires one-time operator approval. This is a partial CaMeL-inspired boundary, **not** an implementation of the full CaMeL interpreter or proof of protection against all prompt injections.
- `overlays/android/OmegaMobileAgent.kt` — existing `device_status` now invokes the policy before sampling the device.
- `scripts/android_overlay.py` — installer adds both new helpers to the existing Tauri Activity project. Previously installed helper versions may be upgraded **only** when their exact normalized SHA-256 matches an audited original baseline (any valid Android package name); edited third-party files or symlinks are rejected. Existing production MainActivity and approval flow remain intact.

## Evidence actually executed

Host: Linux x86-64, `kotlinc-jvm 1.9.0`, Java 21; no attached S24 Ultra, Android SDK, Rust compiler or native NDK available.

1. RED: compile test `OmegaMemoryLeaseBrokerTest.kt` without new class: compiler `unresolved reference: OmegaMemoryLease`, etc.
2. GREEN: `kotlinc OmegaMemoryLeaseBroker.kt OmegaMemoryLeaseBrokerTest.kt -include-runtime -d /tmp/omega-broker.jar && java -jar /tmp/omega-broker.jar` — **MEM-01..10, 10/10 PASS**. Includes allocation ceilings, two-phase reclaim, incorrect acknowledgements, priority and thermal rejection, ID validation, deterministic seeded workloads [101,202,303,404,20261121] with 300 operations each, and 12 concurrent same-ID reservations (one accepted).
3. `kotlinc OmegaCapabilityPolicy.kt OmegaMobileAgent.kt OmegaCapabilityPolicyTest.kt -include-runtime -d /tmp/omega-policy.jar && java -jar /tmp/omega-policy.jar` — **CAM-01..06, 6/6 PASS**.
4. Existing `OmegaMobileAgentTest.kt` against the new policy-bearing production source — **PASS**.
5. `OmegaThermalMonitor.kt` compiled with real production `OmegaThermalGate` logic and JVM Android API stubs; controlled clock + `ActivityManager`/thermal `LeaseMonitorTest.kt` — **PASS**. This is a modeled Android API integration, **not device E2E**.
6. Existing helper provenance was checked against the GitHub blob OIDs and computed normalized SHA-256 before enabling authorized upgrades: `OmegaThermalMonitor.kt` blob `35c9ca51469d9e606814f9598c7a1541ab60aa4f`, normalized SHA-256 `4880a098eac801b38f38ca21f3c035fc0286f769190e01a6b5ab0a3e631821e7`; `OmegaMobileAgent.kt` blob `f22aa9dd045d7ed426f53075d5bd7443273e53d3`, normalized SHA-256 `118cdac63dbae532eaabc515cbc0243e72fd65d18a81f782af120dd76a2e85fa`.
7. New Kotlin source Git blob SHA verified against `git hash-object` from locally compiled/tested files. Python overlay and Kotlin/JVM runner update added to repo; *full* Python regression suite, full Kotlin lifecycle fixture, actual Android build and hardware E2E were **NOT_RUN** in this increment.

## Safety and remaining work

Android API 15+ limits foreground `dataSync`/`mediaProcessing` service operation to 6h per 24h, and Android 16 KB compatibility is mandatory where Google Play requires it; verify final target SDK and native binaries before shipping. Model weights and permissions remain subject to per-version SPDX/license review. The Tencent HunyuanVideo and HunyuanVideo-1.5 source license excludes EU/UK/KR; this **does not** imply every unrelated Hunyuan-tagged package has an identical license. References: https://developer.android.com/guide/practices/page-sizes ; https://developer.android.com/develop/background-work/services/fgs/timeout ; https://github.com/Tencent-Hunyuan/HunyuanVideo/blob/main/LICENSE.txt .

**Open:** Native Rust implementation + cargo/Kani proof; JNI binding to llama.cpp/ggml and the actual GPU/NPU model loader; callback from unload completion to lease acknowledgement; physical S24 RAM/thermal metrics; process-death and foreground-service recovery; secure Android Keystore provider vault; 16 KB ELF test; input fuzzing; full Gradle/NDK/CI/Play policy and user-visible UI. No claimed full 18-pillar implementation, APK, signed AAB, physical device test or deployment.

## Verification status

- Implemented: Kotlin broker, policy, monitor bridge, overlay installer wiring, tests/fixtures, evidence and roadmap.
- Local testing: MEM-01..10 PASS, CAM-01..06 PASS, mobile agent legacy check PASS, modeled Android monitor integration PASS.
- Integrated on device: **NOT_RUN**.
- Security: limited local capability tests PASS; full penetration/SSRF/CaMeL and native sandbox **OPEN**.
- Release Gate-09: **OPEN**.

## 16 KiB release preflight (ENT-51/PSZ-01..10, second increment)

New `scripts/verify_android_pagesize.py` validates **every** arm64 ELF shared library found in a candidate APK/AAB by reading ELF64 program headers (ET_DYN, EM_AARCH64, PT_LOAD, power-of-two `p_align >= 16384`, congruent `p_offset` and `p_vaddr`). For APK it additionally checks the real ZIP local-file data offset of each uncompressed `.so` is divisible by 16384; compressed native libraries are refused for this mmap-oriented packaging contract. Archive path traversal, unexpected ABIs, symlinks, duplicates and oversized inputs are rejected. An AAB by itself is **PARTIAL / exit 2**, because actual APK ZIP alignment can only be verified after `bundletool` creates the final installation APK.

```bash
python -m unittest discover -s tests -p test_android_pagesize.py -v
python scripts/verify_android_pagesize.py path/to/release.apk
```

**Actual locally executed RED:** missing module import. **GREEN:** 10/10 deterministic Python unittest cases PASS, Python 3.13.5 on Linux x86-64, using crafted ELF and APK/AAB fixture bytes. Source blob Git-SHA: `97fb26d80bc29dac1f1c56cd54623bda4e378dfa`; test source blob Git-SHA: `f0fbd11132153df8b24bcd9a3df2f4e3a194c71c`. Real NDK-built `.so`, production APK/AAB, `zipalign -c -P 16`, `bundletool`, Play release and physical device: **NOT_RUN**. PASS applies to test fixtures only and does not certify that an unsigned or synthetic APK is ready for publication.
