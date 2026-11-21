import com.omega.studio.runtime.NativeLlamaEngine
import java.io.RandomAccessFile
import java.nio.file.Files

private fun fails(block: () -> Unit): Boolean = try {
    block(); false
} catch (_: IllegalArgumentException) { true } catch (_: IllegalStateException) { true }

fun main() {
    val file = Files.createTempFile("omega-jni-generation", ".gguf")
    try {
        Files.write(file, "GGUFtest".toByteArray())
        RandomAccessFile(file.toFile(), "r").use { raf ->
            val field = java.io.FileDescriptor::class.java.getDeclaredField("fd")
            field.isAccessible = true
            val fd = field.getInt(raf.fd)
            val engine = NativeLlamaEngine()
            check(engine.nativeLoad(0, fd, 512, 0, 0))
            check(engine.nativeLoad(1, fd, 128, 0, 1))
            check(engine.generate(0, "Prompt Zażółć", 10) == "ab")
            check(engine.generate(1, "Prompt", 10) == "ab")
            check(engine.generate(0, "Prompt Zażółć", 10) == "ab")
            check(fails { engine.generate(-1, "Hi", 10) })
            check(fails { engine.generate(0, "Hi", 0) })
            check(fails { engine.generate(0, "Hi", 4097) })
            engine.nativeCancel(0)
            check(engine.generate(0, "again", 8) == "ab")
            engine.nativeUnload(1)
            engine.nativeUnload(0)
            check(fails { engine.generate(1, "Hi", 10) })
            println("OMEGA JNI GENERATION 8/8 PASS (llama stub, actual native JNI boundary)")
        }
    } finally { Files.deleteIfExists(file) }
}
