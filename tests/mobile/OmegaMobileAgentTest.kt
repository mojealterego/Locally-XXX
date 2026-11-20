package @PACKAGE@
private fun expectFailure(op: ()->Unit) { try {op();error("Expected failure") } catch(ex: IllegalArgumentException) {} catch(ex: IllegalStateException) { check(ex.message!="Expected failure") } }
fun main() {
 var calls=0
 val agent=OmegaMobileAgent(object: MobileHealthProvider {override fun sample():MobileHealth{ calls++;return MobileHealth(4096,1,73,true)}})
 expectFailure {agent.execute("shell",true)}
 expectFailure {agent.execute("device_status",false)}
 check(calls==0)
 val x=agent.execute("device_status",true)
 check(x.availableMemoryMiB==4096L && x.batteryPercent==73 && calls==1)
 expectFailure {OmegaMobileAgent(object:MobileHealthProvider {override fun sample()=MobileHealth(-1,9,110,false)}).execute("device_status",true)}
 println("PASS: Kotlin mobile approval/capabilities/validation")
}
