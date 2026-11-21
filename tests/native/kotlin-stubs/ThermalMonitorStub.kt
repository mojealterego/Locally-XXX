package com.example.app
internal class OmegaThermalMonitor {
    fun prepareNativeLease(lease:OmegaMemoryLease):OmegaMemoryAdmission=OmegaMemoryAdmission.Granted(lease)
    fun confirmNativeLease(ticket:Long,unloadedIds:Collection<String>):OmegaMemoryLease=OmegaMemoryLease("gguf_primary",256,80)
    fun cancelNativeLease(ticket:Long){}
    fun releaseNativeLease(id:String)=true
}
