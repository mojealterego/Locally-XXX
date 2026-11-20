package com.example.app
import android.os.*
import android.app.ActivityManager
fun main() {
    val power=PowerManager();val memory=ActivityManager();val monitor=OmegaThermalMonitor(power,memory)
    check(!monitor.canAdmit());monitor.start();check(power.listeners.size==1);check(!monitor.canAdmit())
    for(i in 1L..15) Handler.pulse(i*1000);check(monitor.canAdmit())
    power.publish(3);check(!monitor.canAdmit());power.publish(0)
    for(i in 16L..30) Handler.pulse(i*1000);check(monitor.canAdmit());memory.low=true;check(!monitor.canAdmit());memory.low=false
    monitor.stop();check(power.listeners.isEmpty());check(Handler.pending.isEmpty());check(!monitor.canAdmit())
    Build.VERSION.SDK_INT=28;monitor.start();check(power.listeners.isEmpty());check(!monitor.canAdmit())
    println("THERMAL-MONITOR lifecycle, recovery, low memory and unsupported API PASS")
}
