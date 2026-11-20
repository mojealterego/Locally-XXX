package @PACKAGE@

import android.app.Activity
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.view.Gravity
import android.widget.Button
import android.widget.FrameLayout

/** Read-only native entry point inside the existing Tauri Activity (not a second APK). */
internal class OmegaAgentStatusPanel(
    private val activity: Activity,
    private val heavyWorkAllowed: () -> Boolean
) {
    private var control: Button? = null
    private val agent = OmegaMobileAgent(object : MobileHealthProvider {
        override fun sample(): MobileHealth {
            val memory = activity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val info = ActivityManager.MemoryInfo()
            memory.getMemoryInfo(info)
            val power = activity.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val status = if (Build.VERSION.SDK_INT >= 29) power?.currentThermalStatus else null
            val battery = activity.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            val level = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 }
            return MobileHealth(info.availMem / 1048576L, status, level, heavyWorkAllowed())
        }
    })

    fun attach() {
        check(control == null) { "Panel already attached" }
        val root = activity.findViewById<FrameLayout>(android.R.id.content)
        val button = Button(activity)
        button.text = "Agent Ω"
        button.contentDescription = "Mobile Agent device status"
        val margin = (16 * activity.resources.displayMetrics.density).toInt()
        val params = FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.END or Gravity.BOTTOM)
        params.setMargins(margin, margin, margin, margin)
        button.setOnClickListener {
            AlertDialog.Builder(activity)
                .setTitle("Mobile Agent — read-only status")
                .setMessage("Allow a one-time check of memory, thermal state and battery? No device data will be uploaded.")
                .setNegativeButton("Deny", null)
                .setPositiveButton("Allow") { _, _ ->
                    try {
                        val x = agent.execute("device_status", userApproved = true)
                        val message = "Available RAM: ${x.availableMemoryMiB} MiB\nThermal status: ${x.thermalStatus ?: "unknown"}\nBattery: ${x.batteryPercent?.toString() ?: "unknown"}%\nHeavy workload permitted: ${x.heavyWorkAllowed}"
                        AlertDialog.Builder(activity).setTitle("Mobile Agent status").setMessage(message).setPositiveButton("Close", null).show()
                    } catch (_: RuntimeException) {
                        AlertDialog.Builder(activity).setTitle("Mobile Agent unavailable").setPositiveButton("Close", null).show()
                    }
                }.show()
        }
        root.addView(button, params)
        control = button
    }
    fun detach() {
        val button = control ?: return
        (button.parent as? FrameLayout)?.removeView(button)
        control = null
    }
}
