package com.omega.studio.runtime

/** JNI bridge to an in-process llama.cpp runtime. Not a network inference server. */
class NativeLlamaEngine {
    init { System.loadLibrary("omega_llama_jni") }
    external fun nativeLoad(slot: Int, fileDescriptor: Int, contextTokens: Int, gpuLayers: Int, kvMode: Int): Boolean
    external fun nativeUnload(slot: Int)
}
