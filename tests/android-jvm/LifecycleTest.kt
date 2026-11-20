package com.example.app
import android.os.Build
private class Store(var state: OmegaState? = null) : OmegaStore {
    var fail = false
    override fun load() = state
    override fun save(state: OmegaState): Boolean { if (fail) return false; this.state = state; return true }
}
private fun fails(f: () -> Unit) { var failed = false; try { f() } catch (_: IllegalStateException) { failed = true }; check(failed) }
fun main() {
    var count = 0
    fun test(name: String, f: () -> Unit) { f(); count++; println("PASS $name") }
    test("native initial lifecycle") {
        val s = Store(); val a = OmegaLifecycle(s,"p1"); check(!a.create().recoveryRequired); a.transition("FOREGROUND"); a.transition("BACKGROUND"); a.transition("FOREGROUND"); a.transition("DETACHED"); check(s.state?.phase == "DETACHED")
    }
    test("process death sets persistent recovery latch") {
        val s = Store(); OmegaLifecycle(s,"p1").apply { create(); transition("FOREGROUND") }; val b = OmegaLifecycle(s,"p2"); check(b.create().recoveryRequired && s.state?.generation == 2L); b.transition("DETACHED"); check(OmegaLifecycle(s,"p2").create().recoveryRequired)
    }
    test("old Activity cannot overwrite new generation") {
        val s=Store(); val a=OmegaLifecycle(s,"p"); a.create(); a.transition("FOREGROUND"); val b=OmegaLifecycle(s,"p"); check(!b.create().recoveryRequired); b.transition("FOREGROUND"); a.transition("DETACHED"); check(s.state?.generation==2L && s.state?.phase=="FOREGROUND")
    }
    test("write failure and invalid transition fail closed") {
        val s=Store(); val a=OmegaLifecycle(s,"p"); a.create(); fails { a.transition("BACKGROUND") }; s.fail=true; fails { a.transition("FOREGROUND") }; check(s.state?.phase=="CREATED")
    }
    test("corrupt checkpoint refused") { fails { OmegaLifecycle(Store(OmegaState(-1,"BAD","",false)),"p").create() } }
    test("production MainActivity calls original Tauri lifecycle and persists phases") {
        val prefs=TauriActivity.prefs; prefs.values.clear(); val a=MainActivity(); a.onCreate(null); a.onStart(); a.onStop(); a.onDestroy(); check(a.calls==listOf("create","start","stop","destroy")); check(prefs.values["phase"]=="DETACHED"); check(prefs.values["generation"]==1L)
    }
    test("production MainActivity rejects wrong ABI before Tauri startup") {
        Build.SUPPORTED_ABIS=arrayOf("x86_64");val a=MainActivity(); fails { a.onCreate(null) };check(a.calls.isEmpty());Build.SUPPORTED_ABIS=arrayOf("arm64-v8a")
    }
    test("production MainActivity rejects failed checkpoint before Tauri startup") {
        TauriActivity.prefs.fail=true;val a=MainActivity();fails { a.onCreate(null) };check(a.calls.isEmpty());TauriActivity.prefs.fail=false
    }
    println("ANDROID-JVM $count/8 PASS")
}
