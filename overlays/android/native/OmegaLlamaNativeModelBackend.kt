package @PACKAGE@

import android.os.ParcelFileDescriptor
import java.io.FileDescriptor
import com.omega.studio.runtime.NativeLlamaEngine

/** Concrete in-process JNI adapter; fails if libomega_llama_jni is not bundled. */
internal class OmegaLlamaNativeModelBackend(
    private val engine: NativeLlamaEngine = NativeLlamaEngine()
) : OmegaModelBackend {
    override fun load(slot: OmegaModelSlot, fd: FileDescriptor, spec: OmegaModelSpec) {
        ParcelFileDescriptor.dup(fd).use { copied ->
            check(engine.nativeLoad(slot.ordinal, copied.fd, spec.contextTokens, spec.gpuLayers, spec.kvMode)) {
                "The native llama.cpp backend could not load the model"
            }
        }
    }
    override fun unload(slot: OmegaModelSlot) = engine.nativeUnload(slot.ordinal)
}
