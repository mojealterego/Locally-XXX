package @PACKAGE@

/**
 * Offline Android control-plane memory reservations, not a physical allocator.
 * Eviction is two-phase: callers must unload their real native models and supply a
 * fresh ActivityManager reading before confirming a pending reservation.
 * No memory is "freed" by changing only this accounting structure.
 */
internal data class OmegaMemoryLease(
    val id: String,
    val sizeMiB: Long,
    val priority: Int,
    val revocable: Boolean = true
)

internal sealed interface OmegaMemoryAdmission {
    data class Granted(val lease: OmegaMemoryLease) : OmegaMemoryAdmission
    data class ReclaimRequired(val ticket: Long, val victims: List<String>) : OmegaMemoryAdmission
}

internal data class OmegaMemorySnapshot(val budgetMiB: Long, val usedMiB: Long, val active: List<OmegaMemoryLease>, val pending: Boolean)

/**
 * Every public operation is serialized by @Synchronized; a pending reclamation
 * prevents any other allocation or release from racing with a stale plan.
 */
internal class OmegaMemoryLeaseBroker(
    private val maximumBudgetMiB: Long = 6553,
    private val safetyHeadroomMiB: Long = 1024
) {
    private val idPattern = Regex("[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
    private val active = sortedMapOf<String, OmegaMemoryLease>()
    private var pending: Pending? = null
    private var ticketSequence = 0L
    private var currentBudgetMiB = maximumBudgetMiB

    private data class Pending(
        val ticket: Long,
        val lease: OmegaMemoryLease,
        val victims: List<String>
    )

    init {
        require(maximumBudgetMiB in 1..262144 && safetyHeadroomMiB in 1..32768)
    }

    private fun validate(lease: OmegaMemoryLease) {
        require(idPattern.matches(lease.id) && lease.sizeMiB in 1..maximumBudgetMiB && lease.priority in 0..100)
    }

    private fun used(): Long = active.values.sumOf { it.sizeMiB }

    private fun sampleValid(thermalAllowed: Boolean, freeMiB: Long, budgetMiB: Long) {
        check(thermalAllowed) { "Thermal admission denied" }
        require(freeMiB in 0..1048576 && budgetMiB in 0..maximumBudgetMiB)
        check(budgetMiB > 0 && freeMiB >= safetyHeadroomMiB) { "Insufficient measured headroom" }
    }

    @Synchronized fun propose(
        lease: OmegaMemoryLease,
        thermalAllowed: Boolean,
        freeMiB: Long,
        effectiveBudgetMiB: Long
    ): OmegaMemoryAdmission {
        validate(lease)
        check(pending == null) { "Another reclamation is pending" }
        check(!active.containsKey(lease.id)) { "Lease ID already exists" }
        sampleValid(thermalAllowed, freeMiB, effectiveBudgetMiB)
        currentBudgetMiB = effectiveBudgetMiB
        val targetUsed = used() + lease.sizeMiB
        if (targetUsed <= effectiveBudgetMiB && freeMiB >= lease.sizeMiB + safetyHeadroomMiB) {
            active[lease.id] = lease
            return OmegaMemoryAdmission.Granted(lease)
        }
        // Deterministic order: lower priority, then stable lexical ID.
        val candidates = active.values.asSequence()
            .filter { it.revocable && it.priority < lease.priority }
            .sortedWith(compareBy<OmegaMemoryLease> { it.priority }.thenBy { it.id })
            .toList()
        val victims = mutableListOf<String>()
        var reclaimed = 0L
        for (v in candidates) {
            reclaimed += v.sizeMiB
            victims.add(v.id)
            if (targetUsed - reclaimed <= effectiveBudgetMiB && freeMiB + reclaimed >= lease.sizeMiB + safetyHeadroomMiB) break
        }
        check(victims.isNotEmpty() && targetUsed - reclaimed <= effectiveBudgetMiB && freeMiB + reclaimed >= lease.sizeMiB + safetyHeadroomMiB) {
            "Insufficient revocable memory" // No partial eviction or reservation has occurred.
        }
        check(ticketSequence < Long.MAX_VALUE) { "Ticket space exhausted" }
        val plan = Pending(++ticketSequence, lease, victims.toList())
        pending = plan
        return OmegaMemoryAdmission.ReclaimRequired(plan.ticket, plan.victims)
    }

    /** Called only after all listed workloads have actually unloaded and telemetry refreshed. */
    @Synchronized fun confirm(
        ticket: Long,
        releasedVictims: Collection<String>,
        thermalAllowed: Boolean,
        freeMiB: Long,
        effectiveBudgetMiB: Long
    ): OmegaMemoryLease {
        val plan = pending ?: error("No reclamation pending")
        check(ticket == plan.ticket && releasedVictims.size == plan.victims.size && releasedVictims.toSet() == plan.victims.toSet()) {
            "Reclamation acknowledgement mismatch"
        }
        sampleValid(thermalAllowed, freeMiB, effectiveBudgetMiB)
        check(freeMiB >= plan.lease.sizeMiB + safetyHeadroomMiB) { "Fresh telemetry does not prove headroom" }
        val releasedTotal = plan.victims.sumOf { active[it]?.sizeMiB ?: error("Missing original victim") }
        check(used() - releasedTotal + plan.lease.sizeMiB <= effectiveBudgetMiB) { "Reservation exceeds refreshed budget" }
        for (id in plan.victims) active.remove(id)
        active[plan.lease.id] = plan.lease
        currentBudgetMiB = effectiveBudgetMiB
        pending = null
        return plan.lease
    }

    /** Retain original reservations on abort: conservative accounting until explicit release. */
    @Synchronized fun abort(ticket: Long) {
        check(pending?.ticket == ticket) { "Unknown ticket" }
        pending = null
    }

    @Synchronized fun release(id: String): Boolean {
        require(idPattern.matches(id))
        check(pending == null) { "Cannot mutate reservations during reclamation" }
        return active.remove(id) != null
    }

    @Synchronized fun snapshot(): OmegaMemorySnapshot = OmegaMemorySnapshot(
        currentBudgetMiB, used(), active.values.toList(), pending != null
    )

    @Synchronized fun invariant(): Boolean {
        val sum = active.values.sumOf { it.sizeMiB }
        return sum >= 0 && sum == used() && active.keys.all(idPattern::matches) &&
            active.values.all { it.sizeMiB in 1..maximumBudgetMiB } &&
            (pending == null || pending!!.victims.all(active::containsKey)) &&
            (currentBudgetMiB in 0..maximumBudgetMiB)
    }
}
