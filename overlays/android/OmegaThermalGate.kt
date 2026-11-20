package @PACKAGE@

/** Fail closed on unknown/stale status; recover only after continuous cool dwell. */
class OmegaThermalGate(private val dwellMs: Long = 15000, private val maxAgeMs: Long = 5000) {
    init { require(dwellMs in 0..600000 && maxAgeMs in 1..60000) }
    private var last = -1L
    private var coolSince = -1L
    private var status = -1
    @Synchronized fun sample(value: Int, now: Long) {
        if (now < 0 || now < last || value !in 0..6) { invalidate(); return }
        if (value >= 2 || last < 0 || now-last > maxAgeMs || status >= 2) coolSince = if (value <= 1) now else -1
        status = value; last = now
    }
    @Synchronized fun invalidate() { last = -1; coolSince = -1; status = -1 }
    @Synchronized fun admit(now: Long, availableMiB: Long): Boolean =
        status in 0..1 && last >= 0 && now >= last && now-last <= maxAgeMs && coolSince >= 0 && now-coolSince >= dwellMs && availableMiB >= 1024
}
