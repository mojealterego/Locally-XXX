package android.app
class ActivityManager {
    class MemoryInfo { var availMem=0L;var totalMem=0L;var lowMemory=false }
    var available=2L*1024*1024*1024;var total=12L*1024*1024*1024;var low=false
    fun getMemoryInfo(info: MemoryInfo) { info.availMem=available;info.totalMem=total;info.lowMemory=low }
}
