package com.example.app

import java.io.File
import java.io.FileDescriptor
import java.nio.file.Files
import java.util.Collections
import kotlin.concurrent.thread

private fun gguf(root: File, name: String): File {
    val file = File(root, name)
    file.outputStream().use { out ->
        out.write(byteArrayOf(71,71,85,70,3,0,0,0))
        out.write(byteArrayOf(1,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0))
        out.write(ByteArray(120))
    }
    return file
}
private fun denied(block: ()->Unit) {
    var rejected=false
    try { block() } catch (_:IllegalArgumentException) { rejected=true }
    catch (_:IllegalStateException) { rejected=true }
    check(rejected) { "Operation unexpectedly accepted" }
}
private class Admission : OmegaModelAdmission {
    private val leases=linkedMapOf<String,OmegaMemoryLease>()
    var capacity=1600L
    var free=10000L
    var forceConfirmFailure=false
    private var pending: Pair<Long,List<String>>?=null
    private var planned:OmegaMemoryLease?=null
    private var next=0L
    val history=mutableListOf<String>()
    override fun prepare(lease:OmegaMemoryLease):OmegaMemoryAdmission {
        check(pending==null)
        check(lease.id !in leases)
        history.add("prepare:${lease.id}")
        val used=leases.values.sumOf { it.sizeMiB }
        if(used+lease.sizeMiB<=capacity && free>=lease.sizeMiB+100) {
            leases[lease.id]=lease;return OmegaMemoryAdmission.Granted(lease)
        }
        val victims=leases.values.filter { it.revocable && it.priority<lease.priority }
            .sortedWith(compareBy<OmegaMemoryLease> { it.priority }.thenBy{it.id})
        val selected=mutableListOf<String>(); var returned=0L
        for(v in victims) { selected.add(v.id);returned+=v.sizeMiB
            if(used+lease.sizeMiB-returned<=capacity)break
        }
        check(selected.isNotEmpty() && used+lease.sizeMiB-returned<=capacity)
        pending=(++next) to selected;planned=lease
        return OmegaMemoryAdmission.ReclaimRequired(next,selected)
    }
    override fun confirm(ticket:Long, unloaded:Collection<String>):OmegaMemoryLease {
        val p=checkNotNull(pending);check(p.first==ticket && p.second.toSet()==unloaded.toSet())
        if(forceConfirmFailure)error("LMKD admission failed after unload")
        for(id in unloaded)leases.remove(id)
        val new=checkNotNull(planned);leases[new.id]=new;pending=null;planned=null
        history.add("confirm:${new.id}");return new
    }
    override fun abort(ticket:Long) { check(pending?.first==ticket);history.add("abort");pending=null;planned=null }
    override fun release(id:String):Boolean {check(pending==null);history.add("release:$id");return leases.remove(id)!=null}
    fun includes(id:String)=id in leases
    fun used()=leases.values.sumOf { it.sizeMiB }
}
private class Driver : OmegaModelBackend {
    val loaded=mutableSetOf<OmegaModelSlot>()
    val events=mutableListOf<String>()
    var failLoad=false
    var failUnload=false
    var failUnloadSlot:OmegaModelSlot?=null
    override fun load(slot:OmegaModelSlot, fd:FileDescriptor, spec:OmegaModelSpec) {
        events.add("load:$slot")
        check(fd.valid())
        if(failLoad)error("partial native load")
        loaded.add(slot)
    }
    override fun unload(slot:OmegaModelSlot) {
        events.add("unload:$slot")
        if(failUnload || slot==failUnloadSlot)error("unload uncertain")
        loaded.remove(slot)
    }
}

fun main(){
    var count=0
    fun test(name:String,fn:()->Unit){fn();count++;println("PASS NMC-${"%02d".format(count)}: $name")}
    val root=Files.createTempDirectory("omega-model-test-").toFile()
    try {
        val file=gguf(root,"primary.gguf")
        val aux=gguf(root,"aux.gguf")
        fun spec(slot:OmegaModelSlot,path:File=if(slot==OmegaModelSlot.PRIMARY)file else aux,kv:Long=64,workspace:Long=128)=
            OmegaModelSpec(slot,path,kv,workspace,2048,0,0)
        test("native backend invoked only after validated lease"){
            val a=Admission();val d=Driver();val c=OmegaNativeModelCoordinator(root,a,d)
            val receipt=c.load(spec(OmegaModelSlot.PRIMARY))
            check(receipt.leaseId=="gguf_primary" && d.loaded==setOf(OmegaModelSlot.PRIMARY))
            check(a.history.first()=="prepare:gguf_primary")
            check(c.unload(OmegaModelSlot.PRIMARY) && !a.includes("gguf_primary"))
        }
        test("fail-closed when request cannot fit"){
            val a=Admission().apply{capacity=1};val d=Driver();val c=OmegaNativeModelCoordinator(root,a,d)
            denied{c.load(spec(OmegaModelSlot.PRIMARY))};check(d.events.isEmpty())
        }
        test("verified auxiliary unload precedes primary admission"){
            val a=Admission().apply{capacity=340};val d=Driver();val c=OmegaNativeModelCoordinator(root,a,d)
            c.load(spec(OmegaModelSlot.AUXILIARY))
            c.load(spec(OmegaModelSlot.PRIMARY))
            check(d.events==listOf("load:AUXILIARY","unload:AUXILIARY","load:PRIMARY"))
            check(a.includes("gguf_primary") && !a.includes("gguf_auxiliary"))
        }
        test("unload failure retains conservative reservation"){
            val a=Admission().apply{capacity=340};val d=Driver();val c=OmegaNativeModelCoordinator(root,a,d)
            c.load(spec(OmegaModelSlot.AUXILIARY));d.failUnloadSlot=OmegaModelSlot.AUXILIARY
            denied{c.load(spec(OmegaModelSlot.PRIMARY))}
            check(a.includes("gguf_auxiliary") && !a.includes("gguf_primary"))
            check(c.snapshot().suspectSlots.contains(OmegaModelSlot.AUXILIARY))
            d.failUnloadSlot=null
            check(c.unload(OmegaModelSlot.AUXILIARY))
        }
        test("failed model load cleans up native partial state"){
            val a=Admission();val d=Driver().apply{failLoad=true};val c=OmegaNativeModelCoordinator(root,a,d)
            denied{c.load(spec(OmegaModelSlot.PRIMARY))};check(!a.includes("gguf_primary"))
            check(d.events==listOf("load:PRIMARY","unload:PRIMARY"))
        }
        test("failed native cleanup retains lease until explicit retry"){
            val a=Admission();val d=Driver().apply{failLoad=true;failUnload=true};val c=OmegaNativeModelCoordinator(root,a,d)
            denied{c.load(spec(OmegaModelSlot.PRIMARY))}
            check(a.includes("gguf_primary") && c.snapshot().suspectSlots.contains(OmegaModelSlot.PRIMARY))
            d.failUnload=false;check(c.unload(OmegaModelSlot.PRIMARY));check(a.used()==0L)
        }
        test("confirm refusal releases truly unloaded victims"){
            val a=Admission().apply{capacity=340};val d=Driver();val c=OmegaNativeModelCoordinator(root,a,d)
            c.load(spec(OmegaModelSlot.AUXILIARY));a.forceConfirmFailure=true
            denied{c.load(spec(OmegaModelSlot.PRIMARY))}
            check(!a.includes("gguf_auxiliary") && !a.includes("gguf_primary") && a.history.contains("abort"))
            check(c.snapshot().activeSlots.isEmpty())
        }
        test("disallow traversal symlinks and malformed GGUF without consuming lease"){
            val a=Admission();val d=Driver();val c=OmegaNativeModelCoordinator(root,a,d)
            val outside=Files.createTempFile("outside-model", ".gguf").toFile()
            try { denied{c.load(spec(OmegaModelSlot.PRIMARY,outside))} }
            finally {outside.delete()}
            val sym=File(root,"symlink.gguf");Files.createSymbolicLink(sym.toPath(), file.toPath())
            denied{c.load(spec(OmegaModelSlot.PRIMARY,sym))}
            val bad=File(root,"invalid.gguf");bad.writeText("bad")
            denied{c.load(spec(OmegaModelSlot.PRIMARY,bad))}
            check(a.history.isEmpty() && d.events.isEmpty())
        }
        test("parallel requests for the same slot admit exactly one"){
            val a=Admission();val d=Driver();val c=OmegaNativeModelCoordinator(root,a,d)
            val accepted=Collections.synchronizedList(mutableListOf<Boolean>())
            val threads=(1..8).map{thread(start=true){try{c.load(spec(OmegaModelSlot.PRIMARY));accepted.add(true)}catch(_:IllegalStateException){accepted.add(false)}}}
            threads.forEach{it.join()};check(accepted.count{it}==1 && a.includes("gguf_primary"))
        }
        test("replace is explicit and close releases both slots"){
            val a=Admission();val d=Driver();val c=OmegaNativeModelCoordinator(root,a,d)
            c.load(spec(OmegaModelSlot.PRIMARY));c.load(spec(OmegaModelSlot.AUXILIARY))
            denied{c.load(spec(OmegaModelSlot.PRIMARY))}
            c.close();check(a.used()==0L && d.loaded.isEmpty())
        }
        println("OMEGA NATIVE MODEL COORDINATOR $count/10 PASS")
    } finally {root.deleteRecursively()}
}
