package com.example.app
fun main() {
    val g=OmegaThermalGate(1000, 5000)
    check(!g.admit(0, 100));g.sample(0,100);check(!g.admit(999,2048));g.sample(1,1100);check(g.admit(1100,2048))
    g.sample(3,1101);check(!g.admit(1101,2048));g.sample(1,2000);check(!g.admit(2999,2048));g.sample(1,3000);check(g.admit(3000,2048));check(!g.admit(8001,2048))
    g.invalidate();check(!g.admit(9000,2048));g.sample(0,9001);g.sample(0,10001);check(!g.admit(10001,0));check(g.admit(10001,1024));g.sample(99,10002);check(!g.admit(10002,1024))
    println("THERMAL-01..03 PASS")
}
