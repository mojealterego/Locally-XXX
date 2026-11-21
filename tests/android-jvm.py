"""Compile real production Kotlin sources; model unavailable Android SDK/TauriActivity."""
from pathlib import Path
import tempfile, subprocess
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp); sources=[]
    for path in sorted((ROOT/'overlays/android').glob('*.kt')):
        if path.name == 'OmegaAgentStatusPanel.kt':
            # Android UI APIs are not mocked as a physical device.
            continue
        out=root/path.name;out.write_text(path.read_text().replace('@PACKAGE@','com.example.app'));sources.append(out)
    sources+=sorted((ROOT/'tests/android-jvm').glob('*.kt'))
    jar=root/'lifecycle.jar'
    subprocess.run(['kotlinc',*map(str,sources),'-include-runtime','-d',str(jar)],check=True,timeout=120)
    subprocess.run(['java','-jar',str(jar)],check=True,timeout=30)
    mobile_test=root/'OmegaMobileAgentTest.kt'
    mobile_test.write_text((ROOT/'tests/mobile/OmegaMobileAgentTest.kt').read_text().replace('@PACKAGE@','com.example.app'))
    mobile_jar=root/'mobile-agent.jar'
    subprocess.run(['kotlinc',str(root/'OmegaMobileAgent.kt'),str(root/'OmegaCapabilityPolicy.kt'),str(mobile_test),'-include-runtime','-d',str(mobile_jar)],check=True,timeout=120)
    subprocess.run(['java','-jar',str(mobile_jar)],check=True,timeout=30)

    policy_test=root/'OmegaCapabilityPolicyTest.kt'
    policy_test.write_text((ROOT/'tests/mobile/OmegaCapabilityPolicyTest.kt').read_text().replace('@PACKAGE@','com.example.app'))
    policy_jar=root/'capability-policy.jar'
    subprocess.run(['kotlinc',str(root/'OmegaCapabilityPolicy.kt'),str(policy_test),'-include-runtime','-d',str(policy_jar)],check=True,timeout=120)
    subprocess.run(['java','-jar',str(policy_jar)],check=True,timeout=30)
    memory_test=root/'OmegaMemoryLeaseBrokerTest.kt'
    memory_test.write_text((ROOT/'tests/mobile/OmegaMemoryLeaseBrokerTest.kt').read_text().replace('@PACKAGE@','com.example.app'))
    memory_jar=root/'memory-broker.jar'
    subprocess.run(['kotlinc',str(root/'OmegaMemoryLeaseBroker.kt'),str(memory_test),'-include-runtime','-d',str(memory_jar)],check=True,timeout=120)
    subprocess.run(['java','-jar',str(memory_jar)],check=True,timeout=30)
