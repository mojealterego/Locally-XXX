# ENT-54 — In-process llama.cpp generation + Android externalNativeBuild integration

Date: 2026-11-21. Repository `mojealterego/Locally-XXX`, branch `main`. **State: PARTIAL, GATE-09 OPEN**.

## Implementation

This increment extends ENT-52 and ENT-53 without introducing an external `llama-server`.

1. `overlays/android/native/OmegaLlamaEngine.{hpp,cpp}` now expose a typed, synchronous `generate(slot, prompt, max_tokens)` operation with a deterministic greedy sampler, tokenization and explicit positions through **the pinned `llama_batch_ext` + `llama_process(LLAMA_PROCESS_TYPE_DECODE)` API**. Prefill is split into batches of 256 tokens, with physical microbatch 64; each request clears its own KV cache; the two independently loaded model/context slots are serialized to avoid concurrent mutable context access. Exceptions are separated into Completed, Cancelled, ContextFull, InvalidRequest and BackendError. The prompt is limited to 65,536 bytes, output to 2 MiB, and new tokens to 4,096. No speculative decoding, streaming deltas, GPU benchmarks or chat-template transformation is claimed.
2. Cancellation is a per-slot atomic flag, written without the generation mutex and sampled between native decoding batches. It does not guarantee immediate interruption inside a long GPU/NPU kernel; the main thread must never call the blocking JNI generate operation.
3. `overlays/android/native/OmegaLlamaJni.cpp` exposes `nativeGenerateBytes` and `nativeCancel`, validates byte and token limits before calling C++ and maps error statuses to Java exceptions. `NativeLlamaEngine.kt` marshals bytes as **UTF-8 ByteArray**, not JNI modified UTF-8, preserving a Unicode codepoint split across tokenizer pieces.
4. `overlays/android/native/CMakeLists.txt` additionally refuses any dirty pinned llama source checkout; requires exact upstream SHA `418fe97b5f01b11eeb89f30d8a0459433edbf1d2` and checks no tracked-file modifications. The upstream `llama.h` at this commit was inspected for `llama_model_load_from_file_ptr`, `llama_batch_ext_add_token`, `llama_process`, `llama_sampler_sample`, and `LLAMA_TOKEN_NULL`. **No actual Android NDK or real llama.cpp compilation took place**.
5. `scripts/install_android_llama.py` is an **explicit opt-in** installation into an existing generated Tauri Android app. It checks the prior ENT-52 helpers, validates a clean exact pinned llama checkout, refuses modified Java/Kotlin/native files and foreign Gradle `externalNativeBuild` blocks, stages sources and Kotlin adapter, and appends a dedicated Gradle Kotlin DSL `android {}` configuration with NDK r28, ABI arm64-v8a, and CMake source environment. Multi-file best-effort rollback, per-project lock, Gradle-last installation and repeatable idempotence are tested. This tool does **not** compile or sign APKs, nor does it change the default Android overlay.

The adapter `OmegaLlamaNativeModelBackend.kt` remains the actual Kotlin port binding ENT-52 admission to the JNI library; it is installed only through the opt-in installer. Native inference is currently synchronous; there is **no UI/Rust command or websocket streaming wired to this new call**. Model-specific KV memory accounting remains caller-supplied and must be independently profiled on device.

## RED / GREEN / validation evidence

Host: Linux x86_64; `clang 17.0.0` C++20 with `-Wall -Wextra -Werror`, AddressSanitizer and UBSan for lifecycle/generation; kotlinc-jvm 1.9.0; OpenJDK 21.0.12.1; Python 3.13.

RED: `OmegaLlamaGenerateTest.cpp` failed to compile against ENT-53: missing `LlamaEngine.generate` and `GenerationStatus`. Separate Python installer test failed import of `scripts.install_android_llama` before the implementation existed.

GREEN and post-change verification:
```bash
bash tests/native/test_llama_jni_host.sh
# existing C++ load/unload lifecycle (mock llama): 9/9 PASS
# new native generation C++ (mock llama): 10/10 PASS
# existing JVM->JNI lifecycle (mock llama): 8/8 PASS
# new JVM->JNI generation (mock llama): 8/8 PASS
# Kotlin coordinator, memory broker and JNI adapter compilation: PASS (stub Android APIs)

python3 -m unittest discover -s tests -p test_android_llama_installer.py -v
# 8/8 PASS
bash -n tests/native/test_llama_jni_host.sh
python3 -m py_compile scripts/install_android_llama.py tests/test_android_llama_installer.py
```

Native generation test conditions: repeated KV reset, two model slots, prefill spanning multiple batches, invalid limits, bounded context exhaustion, recoverable process error, raw fragmented UTF-8, cross-thread cancellation through a deterministic condition-variable barrier, and full release. Installer tests: idempotence, conflict avoidance, source pin/dirty checks, symlink denial, concurrent lock, and rollback on third atomic replacement failure.

**Scope of evidence:** 35 host C++/JNI lifecycle+generation cases, 8 installer cases, one Kotlin compilation contract. The llama behavior is supplied by a **local test double**; the test executes the actual C++ generation loop and real JNI boundary but does NOT prove inference with authentic llama.cpp or GGUF weights, compatibility of generated Gradle Kotlin DSL, GPU throughput or S24 Ultra memory/thermal behavior.

## Source hashes (Git blob IDs)

- `OmegaLlamaEngine.hpp`: `972c8a8a53b9cccb0372a49855787e9fc4d29999`
- `OmegaLlamaEngine.cpp`: `964a70f481a1292a6c100ab18acfd45bd8d81114`
- `OmegaLlamaJni.cpp`: `e90e6f1ad97bf254e8a5c971deb1ce30d89734dc`
- `NativeLlamaEngine.kt`: `41cf70804221fe7ffa6ed1546b894c1001c27af7`
- `CMakeLists.txt`: `4728c76ca5afbe35563212559eeaba5c69247dbe`
- `scripts/install_android_llama.py`: `b1362ecd03605be18ee76a69612ff96ba4ab327d`
- `OmegaLlamaGenerateTest.cpp`: `a36e5466edab1ae54c9d8a7c9abe6e7ed8fd5924`
- `llama_stub.cpp`: `ca78edf27a0db6d39850b6b3c7486b45ff774d88`
- `JniGenerationSmoke.kt`: `e5055d762d963e23acc9b281566d7278126ac109`
- `test_android_llama_installer.py`: `120952216e09674d70d3c6371a7eb4dc4664f221`

## Integration (not executed)

When a clean pinned full llama.cpp checkout and generated Tauri Android Gradle app exist, the opt-in staging command is:

```bash
python3 -m scripts.install_android_llama <trusted-workspace> <android.package.name> <pinned-llama-checkout>
# before Android build, explicitly set:
export OMEGA_LLAMA_SOURCE=<pinned-llama-checkout>
```

Prerequisites: native Android Activity and ENT-52 admission overlay already installed; the generated Gradle build must be recognized and not independently configured with a conflicting `externalNativeBuild` block.

Outstanding gates: production Android NDK r28+ build; full upstream `llama.cpp` link; 16 KiB APK/ELF alignment verification; real model tokenization, KV quantization and logits tests; OpenCL Adreno 750/CPU benchmarks; Android activity lifecycle and UI bridge; physical S24 Ultra multi-model LMKD/thermal and memory recovery tests; license/SBOM; security tests beyond host-simulated failures. **ENT-54 PARTIAL. GATE-09 OPEN.**
