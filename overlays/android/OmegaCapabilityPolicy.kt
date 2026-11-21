package @PACKAGE@

/** Control/data separation for the Android agent. This is a policy boundary, not an LLM sandbox. */
internal enum class OmegaDataOrigin { TRUSTED_OPERATOR, TRUSTED_CONFIG, UNTRUSTED_SOURCE }
internal enum class OmegaToolScope { DEVICE_STATUS, PROJECT_WRITE, NETWORK_EGRESS, SECRET_OR_SIGN }
internal enum class OmegaAgentTrust { PRIVILEGED, QUARANTINED }

internal data class OmegaTaggedArgument(
    val origin: OmegaDataOrigin,
    val allowedReaders: Set<String>
)

internal object OmegaCapabilityPolicy {
    private val safePrincipal = Regex("[A-Za-z0-9][A-Za-z0-9_-]{0,63}")

    fun authorize(
        principal: String,
        trust: OmegaAgentTrust,
        scope: OmegaToolScope,
        arguments: List<OmegaTaggedArgument>,
        operatorApproved: Boolean
    ) {
        require(safePrincipal.matches(principal)) { "Invalid agent identity" }
        check(trust == OmegaAgentTrust.PRIVILEGED) { "Quarantined agent has zero tools" }
        // Fail closed: empty ACL means no authorized readers, never 'public'.
        check(arguments.all { principal in it.allowedReaders }) { "Argument reader not authorized" }
        val hasUntrusted = arguments.any { it.origin == OmegaDataOrigin.UNTRUSTED_SOURCE }
        when (scope) {
            OmegaToolScope.DEVICE_STATUS -> check(operatorApproved) { "Device status requires one-time approval" }
            OmegaToolScope.PROJECT_WRITE -> check(operatorApproved && !hasUntrusted) { "Project write requires trusted, approved input" }
            OmegaToolScope.NETWORK_EGRESS -> check(operatorApproved && !hasUntrusted) { "Egress requires trusted, approved input" }
            OmegaToolScope.SECRET_OR_SIGN -> check(operatorApproved && !hasUntrusted) { "Secret/signing requires trusted, approved input" }
        }
    }
}
