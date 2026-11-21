package @PACKAGE@

import android.app.ActivityManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock

/** Android API 29+ lifecycle adapter. All heavyweight local clients share one lease broker. */
class OmegaThermalMonitor(private val power: PowerManager?, private val memory: ActivityManager?) {
    private val gate = OmegaThermalGate()
    private val leases = OmegaMemoryLeaseBroker()
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

    private data class BudgetSample(val freeMiB: Long, val budgetMiB: Long)
    private fun trustworthyBudget(): BudgetSample {
        check(running && memory != null) { "Android thermal monitor stopped" }
        val info = ActivityManager.MemoryInfo()
        memory.getMemoryInfo(info)
        check(!info.lowMemory && gate.admit(SystemClock.elapsedRealtime(), info.availMem / 1048576)) { "Memory or thermal telemetry not safe" }
        val totalMiB = info.totalMem / 1048576L
        // Reference S24 budget is a ceiling, not a hardcoded promise for every device/One UI build.
        val conservativeBudget = (totalMiB - 5120L).coerceIn(0L, 6553L)
        check(conservativeBudget > 0) { "Insufficient device memory" }
        return BudgetSample(info.availMem / 1048576L, conservativeBudget)
    }

    /** The client must acquire before loading a native model and release after unload. */
    @Synchronized internal fun prepareNativeLease(lease: OmegaMemoryLease): OmegaMemoryAdmission {
        val now = trustworthyBudget()
        return leases.propose(lease, thermalAllowed = true, freeMiB = now.freeMiB, effectiveBudgetMiB = now.budgetMiB)
    }

    /** Confirm only after *all* victims are really unloaded; measure fresh Android memory. */
    @Synchronized internal fun confirmNativeLease(ticket: Long, unloadedIds: Collection<String>): OmegaMemoryLease {
        val now = trustworthyBudget()
        return leases.confirm(ticket, unloadedIds, thermalAllowed = true, freeMiB = now.freeMiB, effectiveBudgetMiB = now.budgetMiB)
    }

    @Synchronized internal fun cancelNativeLease(ticket: Long) = leases.abort(ticket)
    @Synchronized internal fun releaseNativeLease(id: String) = leases.release(id)
    @Synchronized internal fun nativeLeaseSnapshot(): OmegaMemorySnapshot = leases.snapshot()
}
