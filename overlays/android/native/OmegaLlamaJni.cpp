#include "OmegaLlamaEngine.hpp"
#include <jni.h>
#include <exception>

namespace {
omega::LlamaEngine& runtime() {
    static omega::LlamaEngine engine;
    return engine;
}
void fail(JNIEnv* env, const char* msg) {
    jclass ex = env->FindClass("java/lang/IllegalStateException");
    if (ex) env->ThrowNew(ex, msg);
}
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_omega_studio_runtime_NativeLlamaEngine_nativeLoad(
    JNIEnv* env, jobject, jint slot, jint file_descriptor, jint context_tokens, jint gpu_layers, jint kv_mode) {
    try {
        return runtime().load(slot, file_descriptor, context_tokens, gpu_layers, kv_mode) ? JNI_TRUE : JNI_FALSE;
    } catch (const std::exception&) {
        fail(env, "In-process llama.cpp model loading failed");
        return JNI_FALSE;
    } catch (...) {
        fail(env, "Unexpected native model loading failure");
        return JNI_FALSE;
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_omega_studio_runtime_NativeLlamaEngine_nativeUnload(
    JNIEnv* env, jobject, jint slot) {
    try { runtime().unload(slot); }
    catch (...) { fail(env, "Unexpected native model unloading failure"); }
}
