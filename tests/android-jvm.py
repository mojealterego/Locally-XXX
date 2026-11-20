"""Compile real production Kotlin sources; model unavailable Android SDK/TauriActivity."""
from pathlib import Path
import tempfile, subprocess
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp); sources=[]
    for path in sorted((ROOT/'overlays/android').glob('*.kt')):
        out=root/path.name;out.write_text(path.read_text().replace('@PACKAGE@','com.example.app'));sources.append(out)
    sources+=sorted((ROOT/'tests/android-jvm').glob('*.kt'))
    jar=root/'lifecycle.jar'
    subprocess.run(['kotlinc',*map(str,sources),'-include-runtime','-d',str(jar)],check=True,timeout=120)
    subprocess.run(['java','-jar',str(jar)],check=True,timeout=30)
