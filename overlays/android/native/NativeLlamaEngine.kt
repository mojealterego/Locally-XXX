package com.omega.studio.runtime

/** In-process llama.cpp JNI. Call blocking operations from a worker, never the UI thread. */
class NativeLlamaEngine {
    init { System.loadLibrary("omega_llama_jni") }
    external fun nativeLoad(slot: Int, fileDescriptor: Int, contextTokens: Int, gpuLayers: Int, kvMode: Int): Boolean
    external fun nativeUnload(slot: Int)
    external fun nativeCancel(slot: Int)
    private external fun nativeGenerateBytes(slot: Int, promptUtf8: ByteArray, maxTokens: Int): ByteArray

    /** Strict UTF-8 bytes across JNI; preserves multi-byte characters split between LLM tokens. */
    fun generate(slot: Int, prompt: String, maxTokens: Int): String =
        nativeGenerateBytes(slot, prompt.toByteArray(Charsets.UTF_8), maxTokens).toString(Charsets.UTF_8)
}
