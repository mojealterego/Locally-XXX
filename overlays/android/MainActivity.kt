package @PACKAGE@

import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import java.util.UUID
import android.app.ActivityManager
import android.os.PowerManager

class MainActivity : TauriActivity() {
    companion object { private val processToken = UUID.randomUUID().toString() }
    private lateinit var lifecycleCheckpoint: OmegaLifecycle
    private lateinit var thermalMonitor: OmegaThermalMonitor
    fun canStartHeavyWork(): Boolean = ::thermalMonitor.isInitialized && thermalMonitor.canAdmit()
    override fun onCreate(savedInstanceState: Bundle?) {
        check(Build.SUPPORTED_ABIS.firstOrNull() == "arm64-v8a") { "ARM64 required" }
        val prefs = getSharedPreferences("omega_lifecycle_v1", MODE_PRIVATE)
        lifecycleCheckpoint = OmegaLifecycle(object : OmegaStore {
            override fun load(): OmegaState? {
                if (!prefs.contains("generation")) return null
                return OmegaState(prefs.getLong("generation", -1), prefs.getString("phase", "") ?: "", prefs.getString("process", "") ?: "", prefs.getBoolean("recoveryRequired", true))
            }
            override fun save(state: OmegaState): Boolean = prefs.edit().putLong("generation", state.generation).putString("phase", state.phase).putString("process", state.process).putBoolean("recoveryRequired", state.recoveryRequired).commit()
        }, processToken)
        lifecycleCheckpoint.create()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        thermalMonitor = OmegaThermalMonitor(getSystemService(PowerManager::class.java), getSystemService(ActivityManager::class.java))
    }
    override fun onStart() {
        super.onStart()
        lifecycleCheckpoint.transition("FOREGROUND")
        thermalMonitor.start()
    }
    override fun onStop() {
        try { thermalMonitor.stop(); lifecycleCheckpoint.transition("BACKGROUND") } finally { super.onStop() }
    }
    override fun onDestroy() {
        try { if (::thermalMonitor.isInitialized) thermalMonitor.stop(); if (::lifecycleCheckpoint.isInitialized) lifecycleCheckpoint.transition("DETACHED") } finally { super.onDestroy() }
    }
}
