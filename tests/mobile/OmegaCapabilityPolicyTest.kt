package @PACKAGE@

private inline fun denied(action: () -> Unit) {
    var rejected=false
    try{action()}catch(_:IllegalStateException){rejected=true}
    check(rejected){"Expected policy denial"}
}
fun main(){
  var pass=0;fun test(name:String,block:()->Unit){block();pass++;println("PASS CAM-$pass $name")}
  fun allow(scope:OmegaToolScope,args:List<OmegaTaggedArgument> = emptyList(), approved:Boolean=true, trust:OmegaAgentTrust=OmegaAgentTrust.PRIVILEGED)=
    OmegaCapabilityPolicy.authorize("mobile-agent",trust,scope,args,approved)
  test("quarantined LLM has zero capabilities even with user approval"){
    for(scope in OmegaToolScope.values())denied{allow(scope,approved=true,trust=OmegaAgentTrust.QUARANTINED)}
  }
  test("read-only device status requires one-time approval"){
    denied{allow(OmegaToolScope.DEVICE_STATUS,approved=false)}
    allow(OmegaToolScope.DEVICE_STATUS,approved=true)
  }
  test("untrusted input blocked for network, workspace and signing"){
    val tagged=OmegaTaggedArgument(OmegaDataOrigin.UNTRUSTED_SOURCE,setOf("mobile-agent"))
    for(scope in listOf(OmegaToolScope.NETWORK_EGRESS,OmegaToolScope.PROJECT_WRITE,OmegaToolScope.SECRET_OR_SIGN)) denied{allow(scope,listOf(tagged))}
  }
  test("empty or other-principal ACL never defaults to global read"){
    denied{allow(OmegaToolScope.NETWORK_EGRESS,listOf(OmegaTaggedArgument(OmegaDataOrigin.TRUSTED_OPERATOR, emptySet())))}
    denied{allow(OmegaToolScope.NETWORK_EGRESS,listOf(OmegaTaggedArgument(OmegaDataOrigin.TRUSTED_OPERATOR,setOf("somebody-else"))))}
  }
  test("trusted input requires explicit operator approval for side effects"){
    val tagged=OmegaTaggedArgument(OmegaDataOrigin.TRUSTED_OPERATOR,setOf("mobile-agent"))
    denied{allow(OmegaToolScope.NETWORK_EGRESS,listOf(tagged),approved=false)}
    allow(OmegaToolScope.NETWORK_EGRESS,listOf(tagged),approved=true)
  }
  test("invalid identity rejected"){
    var rejected=false;try{OmegaCapabilityPolicy.authorize("../other",OmegaAgentTrust.PRIVILEGED,OmegaToolScope.DEVICE_STATUS,emptyList(),true)}catch(_:IllegalArgumentException){rejected=true};check(rejected)
  }
  println("CAPABILITY-POLICY $pass/6 PASS")
}
