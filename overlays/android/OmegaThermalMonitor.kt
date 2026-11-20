package @PACKAGE@

import android.app.ActivityManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock

/** Android API 29+ lifecycle adapter. No synthetic temperature or background permission. */
class OmegaThermalMonitor(private val power: PowerManager?, private val memory: ActivityManager?) {
    private val gate = OmegaThermalGate()
    private val handler = Handler(Looper.getMainLooper())
    @Volatile private var running = false
    private val listener = PowerManager.OnThermalStatusChangedListener { if (running) gate.sample(it, SystemClock.elapsedRealtime()) }
    private val tick = object : Runnable {
        override fun run() {
            if (!running) return
            try { gate.sample(power!!.currentThermalStatus, SystemClock.elapsedRealtime()) }
            catch (_: RuntimeException) { gate.invalidate() }
            if (running) handler.postDelayed(this, 1000)
        }
    }
    fun start() {
        if (running || Build.VERSION.SDK_INT < 29 || power == null || memory == null) return
        try { running = true; power.addThermalStatusListener(listener); tick.run() }
        catch (_: RuntimeException) { stop() }
    }
    fun stop() {
        val wasRunning = running; running = false; handler.removeCallbacks(tick); gate.invalidate()
        if (wasRunning && Build.VERSION.SDK_INT >= 29) try { power?.removeThermalStatusListener(listener) } catch (_: RuntimeException) { }
    }
    fun canAdmit(): Boolean {
        if (!running || memory == null) return false
        return try { val info = ActivityManager.MemoryInfo(); memory.getMemoryInfo(info); !info.lowMemory && gate.admit(SystemClock.elapsedRealtime(), info.availMem / 1048576) }
        catch (_: RuntimeException) { false }
    }
}
