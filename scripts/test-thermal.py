"""Compile and execute Kotlin policy and Android adapter against deterministic SDK doubles."""
from pathlib import Path
import tempfile,subprocess
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    d=Path(tmp);sources=[]
    for name in ('OmegaThermalGate.kt','OmegaThermalMonitor.kt'):
        out=d/name;out.write_text((ROOT/'overlays/android'/name).read_text().replace('@PACKAGE@','com.example.app'));sources.append(out)
    fixtures=[ROOT/'tests/android-jvm'/n for n in ('AndroidOs.kt','AndroidApp.kt')]
    for name in ('ThermalTest.kt','ThermalMonitorTest.kt'):
        jar=d/(name+'.jar')
        subprocess.run(['kotlinc',*map(str,sources+fixtures+[ROOT/'tests'/name]),'-include-runtime','-d',str(jar)],check=True,timeout=120)
        subprocess.run(['java','-jar',str(jar)],check=True,timeout=30)
