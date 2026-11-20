package @PACKAGE@

/** Durable native Activity state. A stopped Activity is not evidence of backend idleness. */
internal data class OmegaState(val generation: Long, val phase: String, val process: String, val recoveryRequired: Boolean)
internal interface OmegaStore { fun load(): OmegaState?; fun save(state: OmegaState): Boolean }
internal class OmegaLifecycle(private val store: OmegaStore, private val process: String) {
    private var current: OmegaState? = null
    fun create(): OmegaState {
        check(current == null) { "Activity already created" }
        val old = store.load()
        check(old == null || (old.generation in 1 until Long.MAX_VALUE && old.process.isNotBlank() && old.phase in setOf("CREATED", "FOREGROUND", "BACKGROUND", "DETACHED"))) { "Invalid lifecycle checkpoint" }
        val state = OmegaState((old?.generation ?: 0L) + 1, "CREATED", process, old?.let { it.recoveryRequired || it.process != process } ?: false)
        persist(state); return state
    }
    fun transition(phase: String) {
        val old = checkNotNull(current)
        // Ignore callbacks from a replaced Activity, even when its phase is stale.
        val persisted = store.load()
        if (persisted?.generation != old.generation || persisted.process != process) return
        val allowed = when (old.phase) {
            "CREATED" -> setOf("FOREGROUND", "DETACHED")
            "FOREGROUND" -> setOf("BACKGROUND", "DETACHED")
            "BACKGROUND" -> setOf("FOREGROUND", "DETACHED")
            else -> emptySet()
        }
        check(phase in allowed) { "Invalid lifecycle transition" }
        persist(old.copy(phase = phase))
    }
    private fun persist(state: OmegaState) {
        check(store.save(state)) { "Lifecycle checkpoint write failed" }
        current = state
    }
}
