import com.omega.studio.runtime.NativeLlamaEngine
import java.io.RandomAccessFile
import java.nio.file.Files

fun main() {
    val file=Files.createTempFile("omega-llama-jni", ".gguf")
    try {
        Files.write(file, "GGUFtest".toByteArray())
        RandomAccessFile(file.toFile(),"r").use { raf ->
            val descriptorField=java.io.FileDescriptor::class.java.getDeclaredField("fd")
            descriptorField.isAccessible=true
            val fd=descriptorField.getInt(raf.fd)
            val engine=NativeLlamaEngine()
            check(engine.nativeLoad(0,fd,2048,0,0))
            check(engine.nativeLoad(1,fd,2048,0,1))
            check(!engine.nativeLoad(0,fd,2048,0,0))
            check(!engine.nativeLoad(2,fd,2048,0,0))
            engine.nativeUnload(0)
            engine.nativeUnload(1)
            engine.nativeUnload(1)
            check(engine.nativeLoad(0,fd,2048,0,0))
            engine.nativeUnload(0)
        }
        println("OMEGA JNI SMOKE 8/8 PASS (mock llama backend)")
    } finally { Files.deleteIfExists(file) }
}
