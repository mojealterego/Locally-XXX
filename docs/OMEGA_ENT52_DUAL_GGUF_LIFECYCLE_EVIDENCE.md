# ENT-52 — Transactional Dual-GGUF Model Lifecycle Admission

Date: 2026-11-21. Repository: `mojealterego/Locally-XXX`, branch: `main`. **PARTIAL; GATE-09 OPEN**.

## Scope and architecture

This increment closes the **Android/Kotlin control-plane lifecycle contract**, not the native `llama.cpp` inference implementation.

- `overlays/android/OmegaNativeModelCoordinator.kt`: serialized two-slot PRIMARY/AUXILIARY admission; validated positive KV/workspace reservations, private-directory GGUF header verification and a single open descriptor used both for metadata probing and synchronous native backend loading; derive a conservative weight floor from actual GGUF file length and include caller-supplied KV/workspace MiB. Requests above the model-policy ceiling of 6,553 MiB are refused.
- `overlays/android/OmegaAndroidModelAdmission.kt`: production adapter calling the existing `OmegaThermalMonitor.prepareNativeLease`, `confirmNativeLease`, `cancelNativeLease`, and `releaseNativeLease` methods.
- `OmegaModelBackend` is a **typed port requiring a real synchronous in-process model loader** and a reliable, idempotent unload. It has no fake default implementation. This patch does not claim to invoke `llama.cpp`: its concrete JNI/C++ adapter and NDK build are still OPEN.
- Reclamation is **transactional and non-silent**. Only a lower-priority, revocable slot may be requested for unload. New loads are not submitted until each victim unload has completed and a freshly sampled Android memory/thermal budget admits confirmation. On failure, tickets are aborted and only physically unloaded victims are released.
- If a backend throws during loading, it must be unloaded. If unloading is uncertain or accounting cannot be released, the slot remains in the `suspectSlots` list with its reservation retained, preventing a second load from silently overcommitting.
- The coordinator uses an app-owned private GGUF directory, refuses traversal, symlinks, invalid GGUF version/magic and out-of-bounds input fields, and transfers a **single file descriptor** into the backend (not a re-opened filename). This does not replace `openat2` confinement against untrusted processes that can mutate directory entries; model import must remain protected by app-private storage policy. The caller still must determine a defensible worst-case KV/cache/workspace reservation from model metadata.

## Test evidence — local host only

Environment: Linux x86-64, kotlinc-jvm 1.9.0, JRE 21.0.12. No device, Android NDK, ARM64 toolchain, or actual GGUF weights used.

**TDD RED**: isolated compilation of `tests/mobile/OmegaNativeModelCoordinatorTest.kt` before adding the implementation failed with unresolved `OmegaModelAdmission`, `OmegaMemoryLease`, and coordinator references.

**TDD GREEN**:
```sh
kotlinc OmegaNativeModelCoordinator.kt BrokerTypes.kt OmegaNativeModelCoordinatorTest.kt -include-runtime -d model.jar
java -jar model.jar
# OMEGA NATIVE MODEL COORDINATOR 10/10 PASS
```
The test harness contains only minimal **types** mirroring the existing `OmegaMemoryLease`/ `OmegaMemoryAdmission` contract and an explicit fake backend/admission gateway; the coordinator source itself is the exact source installed in the repository, with the package marker `@PACKAGE@` replaced for JVM testing.

NMC-01 lease-before-load, NMC-02 capacity refusal, NMC-03 auxiliary unload before primary load, NMC-04 unload failure retains lease/suspect, NMC-05 partial-load cleanup, NMC-06 failed cleanup retains lease, NMC-07 denied confirmation releases only actually unloaded victims, NMC-08 private directory/symlink/GGUF rejection, NMC-09 8 concurrent duplicate slot requests (one admitted), NMC-10 explicit replace and close/unload.

**Adapter compilation:** `OmegaNativeModelCoordinator.kt` and `OmegaAndroidModelAdmission.kt` compiled successfully against minimal JVM `OmegaThermalMonitor` method stubs. The **actual full** Android Tauri/Kotlin, Android UI and full Python overlay regression were NOT_RUN in this increment; adding the files to `tests/android-jvm.py` does not itself prove the suite passed.

Git blob SHAs of locally tested source and tests:
- Coordinator: `b4c35fd0f5f64360e6f095637c34df6758e1fffc`
- Android admission adapter: `27a7aa413c082568d5e9fbfa16e2b6a9ee0f0f81`
- Test suite: `d1c5c230a9323315637ad718f09a689646fdbd9f`

## Gating and remaining implementation

1. Implement the actual C++/JNI in-process `llama.cpp` adapter and bind it to Android's real model import; pin and verify upstream llama header ABI, backend versions and ML dependencies.
2. Use real model-specific KV/cache and worst-case prefill allocations as budget input, rather than trusting an arbitrary upper estimate.
3. Run Android ARM64 NDK r28+ build, verify every shared-library ELF/ZIP 16 KiB boundary, enable hardware OpenCL/CPU paths and run real S24 Ultra tests.
4. Implement renderer priority callbacks for other workloads (photo/3D); currently an unknown victim causes a deterministic fail-closed abort.
5. Run full Kotlin, Python, end-to-end and operator permission/security tests; evaluate cancellation, process death and lifecycle recovery.

**No actual JNI inference, NPU throughput, speculative decoding, Android release APK or device verification is claimed. ENT-52 PARTIAL, GATE-09 OPEN.**
