#include "OmegaLlamaEngine.hpp"
#include <jni.h>
#include <exception>
#include <string>

namespace {
omega::LlamaEngine& runtime() {
    static omega::LlamaEngine engine;
    return engine;
}
void fail(JNIEnv* env, const char* type, const char* message) {
    jclass klass = env->FindClass(type);
    if (klass) env->ThrowNew(klass, message);
}
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_omega_studio_runtime_NativeLlamaEngine_nativeLoad(
    JNIEnv* env, jobject, jint slot, jint file_descriptor, jint context_tokens, jint gpu_layers, jint kv_mode) {
    try {
        return runtime().load(slot, file_descriptor, context_tokens, gpu_layers, kv_mode) ? JNI_TRUE : JNI_FALSE;
    } catch (const std::exception&) {
        fail(env, "java/lang/IllegalStateException", "In-process llama.cpp model loading failed");
        return JNI_FALSE;
    } catch (...) {
        fail(env, "java/lang/IllegalStateException", "Unexpected native model loading failure");
        return JNI_FALSE;
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_omega_studio_runtime_NativeLlamaEngine_nativeUnload(JNIEnv* env, jobject, jint slot) {
    try { runtime().unload(slot); }
    catch (...) { fail(env, "java/lang/IllegalStateException", "Unexpected native model unloading failure"); }
}

extern "C" JNIEXPORT void JNICALL
Java_com_omega_studio_runtime_NativeLlamaEngine_nativeCancel(JNIEnv*, jobject, jint slot) {
    runtime().cancel(slot); // atomic flag: does not wait on the generation mutex
}

/**
 * Synchronous raw-byte token delivery on the same worker thread as generation.
 * The callback must only enqueue chunks; invoking blocking native model methods from it can deadlock.
 * Fragment boundaries are not guaranteed to match UTF-8 code point boundaries.
 */
extern "C" JNIEXPORT jint JNICALL
Java_com_omega_studio_runtime_NativeLlamaEngine_nativeGenerateStream(
    JNIEnv* env, jobject, jint slot, jbyteArray prompt_bytes, jint max_tokens, jobject listener) {
    if (!prompt_bytes || !listener) {
        fail(env, "java/lang/IllegalArgumentException", "Prompt and listener are required");
        return -1;
    }
    const jsize input_size = env->GetArrayLength(prompt_bytes);
    if (input_size < 1 || input_size > 65536 || max_tokens < 1 || max_tokens > 4096) {
        fail(env, "java/lang/IllegalArgumentException", "Invalid streaming generation bounds");
        return -1;
    }
    jclass listener_class = env->GetObjectClass(listener);
    if (!listener_class) return -1;
    jmethodID on_token = env->GetMethodID(listener_class, "onToken", "([B)V");
    env->DeleteLocalRef(listener_class);
    if (!on_token || env->ExceptionCheck()) return -1;
    try {
        std::string input(static_cast<size_t>(input_size), '\0');
        env->GetByteArrayRegion(prompt_bytes, 0, input_size, reinterpret_cast<jbyte*>(input.data()));
        if (env->ExceptionCheck()) return -1;
        const auto output = runtime().generate(slot, input, max_tokens, [&](const std::string& piece) -> bool {
            if (piece.empty()) return true;
            jbyteArray chunk = env->NewByteArray(static_cast<jsize>(piece.size()));
            if (!chunk) return false;
            env->SetByteArrayRegion(chunk, 0, static_cast<jsize>(piece.size()),
                                    reinterpret_cast<const jbyte*>(piece.data()));
            if (!env->ExceptionCheck()) env->CallVoidMethod(listener, on_token, chunk);
            env->DeleteLocalRef(chunk);
            return !env->ExceptionCheck();
        });
        // Propagate the original Java exception instead of overwriting it with cancellation.
        if (env->ExceptionCheck()) return -1;
        switch (output.status) {
            case omega::GenerationStatus::Completed:
                return static_cast<jint>(output.generated_tokens);
            case omega::GenerationStatus::Cancelled:
                fail(env, "java/util/concurrent/CancellationException", "Streaming generation cancelled");
                break;
            case omega::GenerationStatus::ContextFull:
                fail(env, "java/lang/IllegalStateException", "Model context window exhausted");
                break;
            case omega::GenerationStatus::InvalidRequest:
                fail(env, "java/lang/IllegalArgumentException", "Invalid or unloaded model slot");
                break;
            case omega::GenerationStatus::BackendError:
                fail(env, "java/lang/IllegalStateException", "llama.cpp streaming generation failed");
                break;
        }
    } catch (const std::exception&) {
        if (!env->ExceptionCheck()) fail(env, "java/lang/IllegalStateException", "Native streaming error");
    } catch (...) {
        if (!env->ExceptionCheck()) fail(env, "java/lang/IllegalStateException", "Unexpected native streaming error");
    }
    return -1;
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_omega_studio_runtime_NativeLlamaEngine_nativeGenerateBytes(
    JNIEnv* env, jobject, jint slot, jbyteArray prompt_bytes, jint max_tokens) {
    if (!prompt_bytes) {
        fail(env, "java/lang/IllegalArgumentException", "Prompt bytes are required");
        return nullptr;
    }
    const jsize input_size = env->GetArrayLength(prompt_bytes);
    if (input_size < 1 || input_size > 65536 || max_tokens < 1 || max_tokens > 4096) {
        fail(env, "java/lang/IllegalArgumentException", "Invalid generation bounds");
        return nullptr;
    }
    try {
        std::string input(static_cast<size_t>(input_size), '\0');
        env->GetByteArrayRegion(prompt_bytes, 0, input_size, reinterpret_cast<jbyte*>(input.data()));
        if (env->ExceptionCheck()) return nullptr;
        const auto output = runtime().generate(slot, input, max_tokens);
        switch (output.status) {
            case omega::GenerationStatus::Completed:
                break;
            case omega::GenerationStatus::Cancelled:
                fail(env, "java/util/concurrent/CancellationException", "Model generation cancelled");
                return nullptr;
            case omega::GenerationStatus::ContextFull:
                fail(env, "java/lang/IllegalStateException", "Model context window exhausted");
                return nullptr;
            case omega::GenerationStatus::InvalidRequest:
                fail(env, "java/lang/IllegalArgumentException", "Invalid or unloaded model slot");
                return nullptr;
            case omega::GenerationStatus::BackendError:
                fail(env, "java/lang/IllegalStateException", "llama.cpp generation failed");
                return nullptr;
        }
        const auto length = static_cast<jsize>(output.output.size());
        jbyteArray result = env->NewByteArray(length);
        if (!result) return nullptr;
        if (length > 0) {
            env->SetByteArrayRegion(result, 0, length, reinterpret_cast<const jbyte*>(output.output.data()));
            if (env->ExceptionCheck()) return nullptr;
        }
        return result;
    } catch (const std::exception&) {
        fail(env, "java/lang/IllegalStateException", "Native generation error");
        return nullptr;
    } catch (...) {
        fail(env, "java/lang/IllegalStateException", "Unexpected native generation failure");
        return nullptr;
    }
}
