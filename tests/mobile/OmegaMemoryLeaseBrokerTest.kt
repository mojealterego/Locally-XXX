package @PACKAGE@

import java.util.Random

private inline fun assertFails(block: () -> Unit) {
    var rejected = false
    try { block() } catch (_: IllegalStateException) { rejected = true }
    check(rejected) { "Expected fail-closed operation" }
}

fun main() {
    var passed = 0
    fun test(name: String, block: () -> Unit) { block(); ++passed; println("PASS MEM-$passed $name") }
    val a = OmegaMemoryLease("model_a", 4600, 80, revocable = false)
    val b = OmegaMemoryLease("model_b", 1050, 60)
    val photo = OmegaMemoryLease("photo", 512, 40)
    val scene = OmegaMemoryLease("scene", 1200, 70)
    test("exact 6553 MiB ceiling with allocations") {
        val m = OmegaMemoryLeaseBroker(); m.propose(a,true,6000,6553);m.propose(b,true,3500,6553);m.propose(photo,true,3000,6553)
        check(m.snapshot().usedMiB == 6162L);check(m.invariant())
    }
    test("non-destructive lower-priority eviction plan") {
        val m = OmegaMemoryLeaseBroker();m.propose(a,true,6000,6553);m.propose(b,true,3500,6553);m.propose(photo,true,3000,6553)
        val p = m.propose(scene,true,1300,6553) as OmegaMemoryAdmission.ReclaimRequired
        check(p.victims == listOf("photo","model_b"));check(m.snapshot().usedMiB == 6162L && m.snapshot().pending)
        assertFails { m.release("photo") };assertFails { m.propose(scene,true,3000,6553) }
        m.abort(p.ticket);check(m.snapshot().active.size==3);check(m.invariant())
    }
    test("verified reclaim and fresh telemetry commit") {
        val m = OmegaMemoryLeaseBroker();m.propose(a,true,6000,6553);m.propose(b,true,3500,6553);m.propose(photo,true,3000,6553)
        val p=m.propose(scene,true,1300,6553) as OmegaMemoryAdmission.ReclaimRequired
        assertFails { m.confirm(p.ticket,listOf("photo"),true,4000,6553) }
        assertFails { m.confirm(p.ticket,p.victims,true,2100,6553) } // < 1024 + 1200
        check(m.snapshot().usedMiB==6162L)
        m.confirm(p.ticket,p.victims,true,3400,6553)
        check(m.snapshot().usedMiB==5800L && m.snapshot().active.map{it.id}==listOf("model_a","scene"));check(m.invariant())
    }
    test("priority and thermal failures preserve reservations") {
        val m=OmegaMemoryLeaseBroker();m.propose(a,true,6000,6553)
        assertFails { m.propose(OmegaMemoryLease("x",3000,50),true,4500,6553) }
        assertFails { m.propose(scene,false,4500,6553) }
        assertFails { m.propose(scene,true,900,6553) }
        check(m.snapshot().usedMiB==4600L && !m.snapshot().pending)
    }
    test("duplicate IDs and unauthorized ticket denied") {
        val m=OmegaMemoryLeaseBroker();m.propose(a,true,6000,6553)
        assertFails { m.propose(a,true,6000,6553) }
        assertFails { m.abort(42) }
        check(m.invariant())
    }
    test("memory readback budget decline denies without committing") {
        val m=OmegaMemoryLeaseBroker();m.propose(a,true,6000,6553)
        val p=m.propose(scene,true,2500,6553) as OmegaMemoryAdmission.Granted
        check(p.lease==scene);check(m.snapshot().usedMiB==5800L)
        assertFails { m.propose(OmegaMemoryLease("tiny",1,20),true,4000,4000) }
        check(m.snapshot().usedMiB==5800L && m.invariant())
    }
    test("sorted deterministic victim selection") {
        val m=OmegaMemoryLeaseBroker(1000,100)
        m.propose(OmegaMemoryLease("z",250,10),true,1000,1000)
        m.propose(OmegaMemoryLease("a",250,10),true,1000,1000)
        m.propose(OmegaMemoryLease("core",400,90,false),true,1000,1000)
        val plan=m.propose(OmegaMemoryLease("new",350,50),true,150,1000) as OmegaMemoryAdmission.ReclaimRequired
        check(plan.victims==listOf("a","z"))
    }
    test("invalid fields rejected") {
        val m=OmegaMemoryLeaseBroker()
        for(x in listOf("../bad","*","")) { var fail=false; try{m.propose(OmegaMemoryLease(x,1,1),true,3000,6553)}catch(_:IllegalArgumentException){fail=true};check(fail) }
        var bad=false;try{m.propose(OmegaMemoryLease("valid",-1,1),true,3000,6553)}catch(_:IllegalArgumentException){bad=true};check(bad)
    }
    test("deterministic fuzz model sequences and conservation") {
        for(seed in listOf(101L,202L,303L,404L,20261121L)) {
            val rand=Random(seed);val m=OmegaMemoryLeaseBroker(4096,256)
            for(step in 0 until 300) {
                val id="lease_"+rand.nextInt(16)
                if(rand.nextBoolean()) {
                    try { val r=m.propose(OmegaMemoryLease(id,1L+rand.nextInt(500),rand.nextInt(101)),true,4096,4096);if(r is OmegaMemoryAdmission.ReclaimRequired)m.abort(r.ticket) } catch(_:IllegalStateException) {}
                } else m.release(id)
                check(m.invariant() && m.snapshot().usedMiB<=4096)
            }
        }
    }
    test("concurrent duplicate reservation is serialized") {
        val m=OmegaMemoryLeaseBroker(1000,100)
        val outcomes=java.util.Collections.synchronizedList(mutableListOf<Boolean>())
        val threads=(1..12).map { Thread { try { m.propose(OmegaMemoryLease("same",100,50),true,1000,1000);outcomes.add(true) } catch (_:IllegalStateException){outcomes.add(false)} } }
        threads.forEach(Thread::start);threads.forEach(Thread::join)
        check(outcomes.count{it}==1 && m.snapshot().usedMiB==100L && m.invariant())
    }
    println("MEMORY-BROKER $passed/10 PASS")
}
