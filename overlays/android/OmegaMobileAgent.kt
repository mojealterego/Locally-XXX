package @PACKAGE@

/** Native mobile agent boundary: read-only, no privileged shell or exported service. */
internal data class MobileHealth(val availableMemoryMiB: Long, val thermalStatus: Int?, val batteryPercent: Int?, val heavyWorkAllowed: Boolean)
internal interface MobileHealthProvider { fun sample(): MobileHealth }
internal class OmegaMobileAgent(private val provider: MobileHealthProvider) {
    fun execute(command: String, userApproved: Boolean): MobileHealth {
        require(command == "device_status") { "Unknown mobile command" }
        OmegaCapabilityPolicy.authorize(
            principal = "mobile-agent",
            trust = OmegaAgentTrust.PRIVILEGED,
            scope = OmegaToolScope.DEVICE_STATUS,
            arguments = emptyList(),
            operatorApproved = userApproved
        )
        val result = provider.sample()
        check(result.availableMemoryMiB >= 0 && result.thermalStatus?.let { it in 0..6 } != false && result.batteryPercent?.let { it in 0..100 } != false) { "Invalid device health telemetry" }
        return result
    }
}
