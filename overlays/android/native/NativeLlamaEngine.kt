package com.omega.studio.runtime

/** In-process llama.cpp JNI. Call blocking operations from a worker, never the UI thread. */
fun interface TokenBytesListener {
    /** Token fragments can contain incomplete UTF-8 sequences; do not decode each fragment alone. */
    fun onToken(bytes: ByteArray)
}

class NativeLlamaEngine {
    init { System.loadLibrary("omega_llama_jni") }
    external fun nativeLoad(slot: Int, fileDescriptor: Int, contextTokens: Int, gpuLayers: Int, kvMode: Int): Boolean
    external fun nativeUnload(slot: Int)
    external fun nativeCancel(slot: Int)
    private external fun nativeGenerateBytes(slot: Int, promptUtf8: ByteArray, maxTokens: Int): ByteArray
    private external fun nativeGenerateStream(slot: Int, promptUtf8: ByteArray, maxTokens: Int, listener: TokenBytesListener): Int

    /** Blocks the calling worker thread; callbacks are ordered byte fragments with backpressure. */
    fun generateStreamBytes(slot: Int, prompt: String, maxTokens: Int, onToken: (ByteArray) -> Unit): Int =
        nativeGenerateStream(slot, prompt.toByteArray(Charsets.UTF_8), maxTokens, TokenBytesListener { chunk -> onToken(chunk) })

    /** Strict UTF-8 bytes across JNI; preserves multi-byte characters split between LLM tokens. */
    fun generate(slot: Int, prompt: String, maxTokens: Int): String =
        nativeGenerateBytes(slot, prompt.toByteArray(Charsets.UTF_8), maxTokens).toString(Charsets.UTF_8)
}
