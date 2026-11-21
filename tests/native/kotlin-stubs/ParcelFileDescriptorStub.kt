package android.os
import java.io.FileDescriptor
class ParcelFileDescriptor private constructor(val fd:Int):AutoCloseable {
 companion object {fun dup(fd:FileDescriptor):ParcelFileDescriptor {check(fd.valid());return ParcelFileDescriptor(1)} }
 override fun close(){}
}
