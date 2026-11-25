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
            val pieces = mutableListOf<ByteArray>()
            val streamed = engine.generateStreamBytes(0, "Prompt Zażółć", 10) { chunk ->
                pieces.add(chunk.copyOf())
            }
            check(streamed == 2 && pieces.size == 2)
            check(pieces.flatMap { it.asIterable() }.toByteArray().toString(Charsets.UTF_8) == "ab")
            val text = StringBuilder()
            check(engine.generateStreamText(0, "Prompt", 10) { fragment -> text.append(fragment) } == 2)
            check(text.toString() == "ab")
            val decoder = com.omega.studio.runtime.OmegaUtf8TokenDecoder()
            check(decoder.append(byteArrayOf(0xc4.toByte())).isEmpty())
            check(decoder.append(byteArrayOf(0x85.toByte())) == "ą")
            check(decoder.finish().isEmpty())
            check(fails { engine.generateStreamBytes(-1, "Hi", 4) { } })
            engine.nativeUnload(1)
            engine.nativeUnload(0)
            check(fails { engine.generate(1, "Hi", 10) })
            println("OMEGA JNI GENERATION 8/8 PASS (llama stub, actual native JNI boundary)")
        }
    } finally { Files.deleteIfExists(file) }
}
