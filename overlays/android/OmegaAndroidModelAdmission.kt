package @PACKAGE@

/** Single source of admission truth for future in-process llama.cpp JNI consumers. */
internal class OmegaAndroidModelAdmission(private val monitor: OmegaThermalMonitor) : OmegaModelAdmission {
    override fun prepare(lease: OmegaMemoryLease): OmegaMemoryAdmission = monitor.prepareNativeLease(lease)
    override fun confirm(ticket: Long, unloaded: Collection<String>): OmegaMemoryLease = monitor.confirmNativeLease(ticket, unloaded)
    override fun abort(ticket: Long) = monitor.cancelNativeLease(ticket)
    override fun release(id: String): Boolean = monitor.releaseNativeLease(id)
}
