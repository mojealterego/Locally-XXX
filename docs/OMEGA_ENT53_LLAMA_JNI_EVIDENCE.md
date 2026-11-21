# ENT-53 — Native llama.cpp Dual-GGUF JNI loader

Date: 2026-11-21. Branch `main`. **Status: PARTIAL / GATE-09 OPEN**.

## Implemented artifacts

`overlays/android/native/OmegaLlamaEngine.{hpp,cpp}`: production C++20 two-slot in-process RAII owner using `llama_model_load_from_file_ptr(FILE*, llama_model_params)`, `llama_init_from_model`, `llama_free`, and `llama_model_free`. The native model loader duplicates the operator-authorized file descriptor, creates its own `FILE*` and closes that handle deterministically after synchronous load. It initializes the llama backend once per process. Each slot independently owns one model and context. It rejects invalid slots and context/KV parameters, prevents double allocation and releases model+context on partial init failure. CPU-first default (n_gpu_layers=0) and requested GPU layer count via model spec. No subprocess, HTTP server or downloaded executable.

`overlays/android/native/OmegaLlamaJni.cpp` and `NativeLlamaEngine.kt`: direct JNI exports in stable package `com.omega.studio.runtime`, loading native shared library `omega_llama_jni`. Exceptions are mapped to non-sensitive Java messages without echoing input paths or credentials.

`overlays/android/native/OmegaLlamaNativeModelBackend.kt`: Android adapter implementing the existing ENT-52 `OmegaModelBackend`. Uses `ParcelFileDescriptor.dup()` and a short-lived descriptor across a synchronous JNI model load. This file is kept in the **separately gated native integration directory**, not the default Kotlin overlay, so it cannot silently break an Android app lacking `.so` binaries.

`overlays/android/native/CMakeLists.txt`: fail-closed Android-only build configuration; checks the exact source commit `ggml-org/llama.cpp@418fe97b5f01b11eeb89f30d8a0459433edbf1d2` before invoking `add_subdirectory`, sets Android 16 KiB ELF link alignment, and explicitly requires a complete offline checkout provided as `OMEGA_LLAMA_SOURCE`. No unpinned network fetch or auto-install is performed. API was checked against upstream `include/llama.h` SHA `7122143e5c61369ce25dd827b26a7dc41a185992`: the version uses `llama_model_load_from_file_ptr` and `check_tensors` rather than an obsolete `use_mmap` field.

## Executed local verification

Host: Linux x86-64, clang++ C++20 with `-Wall -Wextra -Werror`, AddressSanitizer+UBSan for native lifecycle, kotlinc 1.9.0, JDK 21.0.12. **No Android NDK, licensed production model or physical S24 Ultra available**.

```bash
bash tests/native/test_llama_jni_host.sh
# OMEGA IN-PROCESS LLAMA MODEL LIFECYCLE 9/9 PASS
# OMEGA JNI SMOKE 8/8 PASS (mock llama backend)
```

Native lifecycle tests exercise invalid slot, FD and context, duplicate slot denial, simultaneous two-slot ownership, idempotent unload, failure of context construction and RAII cleanup using an explicit `tests/native/llama-stub/llama.h` and matching fake implementation. Native model lifecycle was compiled and run with AddressSanitizer + UBSan, without reported leaks or sanitizer violations.

JNI smoke compiles an actual host shared library `libomega_llama_jni.so`, loads it through Kotlin/JVM and exercises the real JNI boundary with two mock-backed slots and repeated load/unload. This validates the **JNI calling convention**, not actual llama inference or GGUF tensor loading. The Android adapter was also successfully typechecked against a minimal `ParcelFileDescriptor` JVM stub, without Android SDK.

Only test doubles use a mock llama; production code includes real upstream `llama.h` and fails to build if the pinned source checkout is absent.

## Remaining gates

- Android build/packaging: wire the JNI sources into a pinned Tauri-generated Android Gradle project and its `externalNativeBuild` task. Do not add a broken dependency to the baseline overlay until that integration passes on real NDK r28+.
- Real inference: run generation / tokenizer / KV correctness, two realistic S24 GGUF models and peak memory/LMKD/thermal profiling. Current engine **loads and unloads** models only; generation and speculative decoding are not part of this increment.
- Add fail-closed dependency verification, full license/SBOM, Android 16 KiB ELF/APK (including bundletool), no-internet and full device E2E.
- Complete the end-to-end controller-to-JNI call chain on Android and real process-death recovery. `OmegaNativeModelCoordinator` is tested through an injected driver; `OmegaLlamaNativeModelBackend` is not yet wired into a running APK.

**Verified state**: core source IMPLEMENTED, lifecycle HOST-TESTED, JNI boundary HOST-TESTED WITH MOCK BACKEND. REAL LLAMA MODEL/E2E, ANDROID NDK, APK, S24, DEPLOYMENT NOT_RUN. ENT-53 PARTIAL; GATE-09 OPEN.
