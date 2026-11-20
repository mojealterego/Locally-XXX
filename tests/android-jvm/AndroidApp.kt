package android.app
class ActivityManager {
    class MemoryInfo { var availMem=0L;var lowMemory=false }
    var available=2L*1024*1024*1024;var low=false
    fun getMemoryInfo(info: MemoryInfo) { info.availMem=available;info.lowMemory=low }
}
