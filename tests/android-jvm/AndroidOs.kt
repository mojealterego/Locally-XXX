package android.os
class Bundle
object Build { var SUPPORTED_ABIS = arrayOf("arm64-v8a"); object VERSION { var SDK_INT=35 } }
object SystemClock { var now=0L; fun elapsedRealtime()=now }
class Looper { companion object { fun getMainLooper()=Looper() } }
class Handler(looper: Looper) {
    companion object { val pending=mutableSetOf<Runnable>(); fun pulse(at: Long) { SystemClock.now=at; val copy=pending.toList();pending.clear();copy.forEach { it.run() } } }
    fun postDelayed(task: Runnable, delay: Long): Boolean { check(delay>0);pending.add(task);return true }
    fun removeCallbacks(task: Runnable) { pending.remove(task) }
}
class PowerManager {
    fun interface OnThermalStatusChangedListener { fun onThermalStatusChanged(status: Int) }
    var currentThermalStatus=0
    val listeners=mutableSetOf<OnThermalStatusChangedListener>()
    fun addThermalStatusListener(listener: OnThermalStatusChangedListener) { listeners.add(listener) }
    fun removeThermalStatusListener(listener: OnThermalStatusChangedListener) { listeners.remove(listener) }
    fun publish(status: Int) { currentThermalStatus=status;listeners.toList().forEach { it.onThermalStatusChanged(status) } }
}
