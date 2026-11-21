"""Extend the existing, pinned Tauri 2.10.1 Android Activity scaffold."""
import argparse, hashlib, json, os, re, tempfile
from pathlib import Path
from scripts.runtime_control import require, RuntimeErrorCode
from scripts.native_acceptance import PACKAGE, NS
import xml.etree.ElementTree as ET

ASSETS=Path(__file__).resolve().parents[1]/'overlays/android'
# Pre-upgrade fingerprints for exact, unmodified old helpers (normalized to com.example.app).
LEGACY_HELPER_SHA256={
    'OmegaThermalMonitor.kt':'4880a098eac801b38f38ca21f3c035fc0286f769190e01a6b5ab0a3e631821e7',
    'OmegaMobileAgent.kt':'118cdac63dbae532eaabc515cbc0243e72fd65d18a81f782af120dd76a2e85fa',
}

def recognized_legacy_helper(path,package):
    expected=LEGACY_HELPER_SHA256.get(path.name)
    if expected is None:return False
    content=path.read_text()
    normalized=content.replace(f'package {package}\n','package com.example.app\n',1)
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()==expected

def template(package):
    return f'''package {package}

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {{
  override fun onCreate(savedInstanceState: Bundle?) {{
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }}
}}
'''

def safe_file(root,path,optional=False):
    current=root
    for part in path.relative_to(root).parts:
        current=current/part
        require(not current.is_symlink(),'ANDROID_PROJECT','Symlink in native project')
    require(path.is_file() or (optional and not os.path.lexists(path)),'ANDROID_PROJECT','Expected regular native source')
    if path.exists():require(path.stat().st_size<=1024**2,'ANDROID_PROJECT','Native source exceeds limit')


def install_lifecycle(workspace,package):
    require(isinstance(package,str) and PACKAGE.fullmatch(package),'ANDROID_PROJECT','Invalid Android package')
    root=Path(workspace).absolute();require(root.is_dir() and not root.is_symlink(),'ANDROID_PROJECT','Unsafe root')
    main=root/'src-tauri/gen/android/app/src/main';activity=main/'java'/Path(*package.split('.'))/'MainActivity.kt';helper=activity.with_name('OmegaLifecycle.kt');manifest=main/'AndroidManifest.xml'
    thermal={activity.with_name(name):(ASSETS/name).read_text().replace('@PACKAGE@',package) for name in ('OmegaThermalGate.kt','OmegaThermalMonitor.kt')}
    native={activity.with_name(name):(ASSETS/name).read_text().replace('@PACKAGE@',package) for name in ('OmegaMobileAgent.kt','OmegaAgentStatusPanel.kt','OmegaMemoryLeaseBroker.kt','OmegaCapabilityPolicy.kt')}
    for p in (activity,manifest,helper,*thermal,*native):safe_file(root,p,p not in (activity,manifest))
    source=activity.read_text();out=(ASSETS/'MainActivity.kt').read_text().replace('@PACKAGE@',package);core=(ASSETS/'OmegaLifecycle.kt').read_text().replace('@PACKAGE@',package)
    old_out=out.replace('    private lateinit var agentPanel: OmegaAgentStatusPanel\n','').replace('        agentPanel = OmegaAgentStatusPanel(this) { thermalMonitor.canAdmit() }\n        agentPanel.attach()\n','').replace('if (::agentPanel.isInitialized) agentPanel.detach(); ','')
    legacy=old_out.replace('import android.app.ActivityManager\nimport android.os.PowerManager\n','').replace('    private lateinit var thermalMonitor: OmegaThermalMonitor\n    fun canStartHeavyWork(): Boolean = ::thermalMonitor.isInitialized && thermalMonitor.canAdmit()\n','').replace('        thermalMonitor = OmegaThermalMonitor(getSystemService(PowerManager::class.java), getSystemService(ActivityManager::class.java))\n','').replace('        thermalMonitor.start()\n','').replace('thermalMonitor.stop(); lifecycleCheckpoint.transition','lifecycleCheckpoint.transition').replace('if (::thermalMonitor.isInitialized) thermalMonitor.stop(); ','')
    require(source in (template(package),legacy,old_out,out),'ANDROID_PROJECT','Unknown MainActivity; refuse overwrite')
    for path,data in {**thermal,**native}.items():require(not path.exists() or path.read_text()==data or recognized_legacy_helper(path,package),'ANDROID_PROJECT','Unknown Android helper; refuse overwrite')
    require(not helper.exists() or helper.read_text()==core,'ANDROID_PROJECT','Unknown lifecycle helper; refuse overwrite')
    raw=manifest.read_text();require('<!DOCTYPE' not in raw.upper() and '<!ENTITY' not in raw.upper(),'MANIFEST','Invalid manifest declarations')
    try: xml=ET.fromstring(raw)
    except ET.ParseError as e:raise RuntimeErrorCode('MANIFEST','Invalid XML') from e
    apps=xml.findall('application');require(xml.tag=='manifest' and len(apps)==1,'MANIFEST','Expected one application')
    backup=apps[0].get(NS+'allowBackup');require(backup in (None,'false'),'MANIFEST','Android backup must be disabled')
    if backup is None:
        # Preserve Gradle placeholders, comments and the original XML namespace.
        require(len(re.findall(r'<application(?=\s|>)',raw))==1,'MANIFEST','Ambiguous application element')
        raw=re.sub(r'<application(?=\s|>)','<application android:allowBackup="false"',raw,count=1)
        require(ET.fromstring(raw).find('application').get(NS+'allowBackup')=='false','MANIFEST','Backup policy failed')
    desired={helper:core,**thermal,**native,activity:out,manifest:raw};staged={}
    try:
        for path,data in desired.items():
            if path.exists() and path.read_text()==data:continue
            fd,tmp=tempfile.mkstemp(prefix='.omega-native-',dir=path.parent);staged[path]=Path(tmp)
            with os.fdopen(fd,'w') as f:f.write(data);f.flush();os.fsync(f.fileno())
        for path,tmp in staged.items():os.replace(tmp,path)
    finally:
        for tmp in staged.values():tmp.unlink(missing_ok=True)
    return {'files':{p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in desired},'package':package}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('workspace');p.add_argument('package');a=p.parse_args()
    try:print(json.dumps(install_lifecycle(a.workspace,a.package),indent=2));return 0
    except (ValueError,OSError,RuntimeErrorCode) as e:p.exit(1,str(e)+'\n')
if __name__=='__main__':raise SystemExit(main())
