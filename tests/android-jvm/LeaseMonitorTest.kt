package com.example.app

import android.app.ActivityManager
import android.os.Handler
import android.os.PowerManager
import android.os.SystemClock

/** Native Android monitor integration tested against controlled API 29+ clock/telemetry. */
fun assertMemoryMonitorIntegration() {
    val power=PowerManager()
    val activity=ActivityManager().apply {
        available=9L*1024*1024*1024
        total=12L*1024*1024*1024
    }
    val monitor=OmegaThermalMonitor(power,activity)
    check(!monitor.canAdmit())
    var rejected=false
    try{monitor.prepareNativeLease(OmegaMemoryLease("primary",4600,80,false))}catch(_:IllegalStateException){rejected=true}
    check(rejected)
    SystemClock.now=0
    monitor.start()
    for(second in 1..16) Handler.pulse(second*1000L)
    check(monitor.canAdmit())
    val result=monitor.prepareNativeLease(OmegaMemoryLease("primary",4600,80,false))
    check(result is OmegaMemoryAdmission.Granted)
    check(monitor.nativeLeaseSnapshot().budgetMiB==6553L)
    check(monitor.nativeLeaseSnapshot().usedMiB==4600L)
    activity.low=true
    rejected=false
    try{monitor.prepareNativeLease(OmegaMemoryLease("other",100,90))}catch(_:IllegalStateException){rejected=true}
    check(rejected && monitor.nativeLeaseSnapshot().usedMiB==4600L)
    activity.low=false
    power.publish(3)
    rejected=false
    try{monitor.prepareNativeLease(OmegaMemoryLease("other",100,90))}catch(_:IllegalStateException){rejected=true}
    check(rejected)
    monitor.stop()
    check(!monitor.canAdmit())
    check(monitor.releaseNativeLease("primary"))
    check(monitor.nativeLeaseSnapshot().usedMiB==0L)
}
