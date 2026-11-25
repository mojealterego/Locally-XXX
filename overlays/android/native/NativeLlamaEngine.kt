package com.omega.studio.runtime

import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction

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

    /** Decode fragmented UTF-8 without splitting Unicode code points in Polish/English output. */
    fun generateStreamText(slot: Int, prompt: String, maxTokens: Int, onText: (String) -> Unit): Int {
        val decoder = OmegaUtf8TokenDecoder()
        val count = generateStreamBytes(slot, prompt, maxTokens) { fragment ->
            val text = decoder.append(fragment)
            if (text.isNotEmpty()) onText(text)
        }
        val remaining = decoder.finish()
        if (remaining.isNotEmpty()) onText(remaining)
        return count
    }

    /** Strict UTF-8 bytes across JNI; preserves multi-byte characters split between LLM tokens. */
    fun generate(slot: Int, prompt: String, maxTokens: Int): String =
        nativeGenerateBytes(slot, prompt.toByteArray(Charsets.UTF_8), maxTokens).toString(Charsets.UTF_8)
}

/** Stateful strict UTF-8 decoder: handles multibyte characters crossing token boundaries. */
class OmegaUtf8TokenDecoder {
    private val decoder = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
    private var incomplete = ByteArray(0)

    @Synchronized fun append(chunk: ByteArray): String {
        require(chunk.size <= 16384) { "Token fragment exceeds bound" }
        val bytes = ByteBuffer.wrap(incomplete + chunk)
        val chars = CharBuffer.allocate(bytes.remaining() + 1)
        val result = decoder.decode(bytes, chars, false)
        if (result.isError) result.throwException()
        check(!result.isOverflow)
        incomplete = ByteArray(bytes.remaining())
        bytes.get(incomplete)
        check(incomplete.size <= 3) { "UTF-8 sequence exceeds boundary" }
        chars.flip()
        return chars.toString()
    }

    @Synchronized fun finish(): String {
        val bytes = ByteBuffer.wrap(incomplete)
        val chars = CharBuffer.allocate(bytes.remaining() + 8)
        val result = decoder.decode(bytes, chars, true)
        if (result.isError) result.throwException()
        check(!result.isOverflow && !bytes.hasRemaining())
        val flushed = decoder.flush(chars)
        if (flushed.isError) flushed.throwException()
        check(!flushed.isOverflow)
        chars.flip()
        val value = chars.toString()
        incomplete = ByteArray(0)
        decoder.reset()
        return value
    }
}
