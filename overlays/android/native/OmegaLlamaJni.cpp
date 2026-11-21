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
