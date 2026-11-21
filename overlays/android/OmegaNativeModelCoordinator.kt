package @PACKAGE@

import java.io.File
import java.io.FileDescriptor
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path

/** Two in-process GGUF slots. Model loading is synchronous; the backend cannot retain fd. */
internal enum class OmegaModelSlot { PRIMARY, AUXILIARY }

internal data class OmegaModelSpec(
    val slot: OmegaModelSlot,
    val file: File,
    val kvMiB: Long,
    val workspaceMiB: Long,
    val contextTokens: Int,
    val kvMode: Int,
    val gpuLayers: Int
)

internal interface OmegaModelBackend {
    /** Must finish loading and close its own duplicate descriptors before returning. */
    fun load(slot: OmegaModelSlot, fd: FileDescriptor, spec: OmegaModelSpec)
    /** Must synchronously release the underlying model/context or throw. Idempotent after failed load. */
    fun unload(slot: OmegaModelSlot)
}

internal interface OmegaModelAdmission {
    fun prepare(lease: OmegaMemoryLease): OmegaMemoryAdmission
    fun confirm(ticket: Long, unloaded: Collection<String>): OmegaMemoryLease
    fun abort(ticket: Long)
    fun release(id: String): Boolean
}

internal data class OmegaLoadedModel(val slot: OmegaModelSlot, val leaseId: String, val reservedMiB: Long)
internal data class OmegaModelRuntimeSnapshot(
    val activeSlots: Set<OmegaModelSlot>,
    val suspectSlots: Set<OmegaModelSlot>
)

/**
 * Transactional lifecycle glue for the existing Android memory broker.
 * No physical memory is reclaimed until a backend unload returns successfully.
 * A failed or uncertain unload retains its lease (fail-closed) until retry.
 * Files must have been imported into a private app-owned directory by trusted code.
 */
internal class OmegaNativeModelCoordinator(
    modelDirectory: File,
    private val admission: OmegaModelAdmission,
    private val backend: OmegaModelBackend
) : AutoCloseable {
    private data class Record(val lease: OmegaMemoryLease, val suspect: Boolean)
    private val models = mutableMapOf<OmegaModelSlot, Record>()
    private val directory: Path = modelDirectory.toPath().toRealPath(LinkOption.NOFOLLOW_LINKS)

    init { require(Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS) && !Files.isSymbolicLink(directory)) }

    private fun id(slot: OmegaModelSlot): String = when (slot) {
        OmegaModelSlot.PRIMARY -> "gguf_primary"
        OmegaModelSlot.AUXILIARY -> "gguf_auxiliary"
    }

    private fun resolveTrustedFile(file: File): Path {
        val path = file.toPath().toAbsolutePath().normalize()
        require(path.startsWith(directory) && path != directory) { "Model must be inside private directory" }
        var current = directory
        for (part in directory.relativize(path)) {
            require(part.toString() != "..")
            current = current.resolve(part)
            require(!Files.isSymbolicLink(current)) { "Symlink in model path" }
        }
        require(Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) { "Model is not regular file" }
        return path
    }

    private fun preflight(spec: OmegaModelSpec): Pair<RandomAccessFile, OmegaMemoryLease> {
        require(spec.contextTokens in 16..131072 && spec.kvMode in 0..2 && spec.gpuLayers in 0..256)
        require(spec.kvMiB in 1..6553 && spec.workspaceMiB in 1..6553)
        val path = resolveTrustedFile(spec.file)
        val file = RandomAccessFile(path.toFile(), "r")
        try {
            val size = file.length()
            require(size >= 24) { "Truncated GGUF" }
            val header = ByteArray(24)
            file.readFully(header)
            val data = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
            require(data.int == 0x46554747) { "Invalid GGUF magic" }
            require(data.int in 2..3) { "Unsupported GGUF version" }
            val tensorCount = data.long
            val metadataCount = data.long
            require(tensorCount in 1..1000000 && metadataCount in 0..4096) { "Invalid GGUF dimensions" }
            val weightMiB = (size / 1048576L) + if (size % 1048576L != 0L) 1 else 0
            val total = Math.addExact(Math.addExact(weightMiB, spec.kvMiB), spec.workspaceMiB)
            require(total in 1..6553) { "GGUF reservation exceeds mobile policy" }
            file.seek(0)
            return file to OmegaMemoryLease(id(spec.slot), total, if (spec.slot == OmegaModelSlot.PRIMARY) 80 else 60, spec.slot != OmegaModelSlot.PRIMARY)
        } catch (failure: Throwable) {
            try { file.close() } catch (cleanup: Throwable) { failure.addSuppressed(cleanup) }
            throw failure
        }
    }

    private fun settleSuccessfulUnload(slot: OmegaModelSlot, id: String) {
        if (!admission.release(id)) {
            models[slot] = models[slot]?.copy(suspect = true) ?: error("Lease release failed")
            error("Failed to release unloaded model reservation")
        }
        models.remove(slot)
    }

    @Synchronized fun load(spec: OmegaModelSpec): OmegaLoadedModel {
        check(spec.slot !in models) { "Unload current slot before replacing" }
        val (source, lease) = preflight(spec)
        return source.use { handle ->
        when (val decision = admission.prepare(lease)) {
            is OmegaMemoryAdmission.Granted -> check(decision.lease == lease)
            is OmegaMemoryAdmission.ReclaimRequired -> {
                val victims = decision.victims.map { leaseId ->
                    models.entries.singleOrNull { it.value.lease.id == leaseId }
                        ?: run { admission.abort(decision.ticket); error("Unmanaged victim: fail closed") }
                }
                val unloaded = mutableListOf<Map.Entry<OmegaModelSlot, Record>>()
                try {
                    for (victim in victims) {
                        try { backend.unload(victim.key) }
                        catch (e: Throwable) {
                            models[victim.key] = victim.value.copy(suspect = true)
                            throw e
                        }
                        unloaded.add(victim)
                    }
                    check(admission.confirm(decision.ticket, unloaded.map { it.value.lease.id }) == lease)
                    for (victim in unloaded) models.remove(victim.key)
                } catch (failure: Throwable) {
                    // Abort any still-pending ticket, then release leases only for physically unloaded victims.
                    try { admission.abort(decision.ticket) } catch (e: Throwable) { failure.addSuppressed(e) }
                    for (victim in unloaded) {
                        try { settleSuccessfulUnload(victim.key, victim.value.lease.id) }
                        catch (e: Throwable) { failure.addSuppressed(e) }
                    }
                    throw failure
                }
            }
        }
        try {
            backend.load(spec.slot, handle.fd, spec)
        } catch (failure: Throwable) {
            // Model backend may have allocated resources before throwing; unload is mandatory.
            var safelyUnloaded = false
            try { backend.unload(spec.slot); safelyUnloaded = true }
            catch (e: Throwable) { failure.addSuppressed(e) }
            if (safelyUnloaded) {
                try { check(admission.release(lease.id)); }
                catch (e: Throwable) { failure.addSuppressed(e); models[spec.slot] = Record(lease, true) }
            } else models[spec.slot] = Record(lease, true)
            throw failure
        }
        models[spec.slot] = Record(lease, false)
        OmegaLoadedModel(spec.slot, lease.id, lease.sizeMiB)
        }
    }

    @Synchronized fun unload(slot: OmegaModelSlot): Boolean {
        val record = models[slot] ?: return false
        try { backend.unload(slot) }
        catch (failure: Throwable) {
            models[slot] = record.copy(suspect = true)
            throw failure
        }
        settleSuccessfulUnload(slot, record.lease.id)
        return true
    }

    @Synchronized fun snapshot(): OmegaModelRuntimeSnapshot = OmegaModelRuntimeSnapshot(
        models.filterValues { !it.suspect }.keys.toSet(),
        models.filterValues { it.suspect }.keys.toSet()
    )

    @Synchronized override fun close() {
        var first: Throwable? = null
        for (slot in OmegaModelSlot.values()) {
            try { unload(slot) } catch (e: Throwable) {
                if (first == null) first = e else first.addSuppressed(e)
            }
        }
        if (first != null) throw first
    }
}
