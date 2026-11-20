"""Native Android acceptance gates for the existing Tauri build; no implicit deployment."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path
import xml.etree.ElementTree as ET
from scripts.runtime_control import require, RuntimeErrorCode

NS='{http://schemas.android.com/apk/res/android}'
PACKAGE=re.compile(r'[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+\Z')
CLASS=re.compile(r'(?:\.?[A-Za-z_$][A-Za-z0-9_$]*)(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\Z')
HEX=re.compile(r'[a-fA-F0-9]{64}\Z')
DENIED={'MANAGE_EXTERNAL_STORAGE','REQUEST_INSTALL_PACKAGES','INSTALL_PACKAGES','DELETE_PACKAGES','SYSTEM_ALERT_WINDOW','WRITE_SECURE_SETTINGS','QUERY_ALL_PACKAGES','BIND_ACCESSIBILITY_SERVICE'}

def verify_signer(report,pin):
    require(isinstance(pin,str) and HEX.fullmatch(pin) and isinstance(report,str) and len(report)<=65536,'SIGNER','Invalid signer pin/report')
    matches=re.findall(r'^Signer #[0-9]+ certificate SHA-256 digest: ([a-fA-F0-9]{64})\s*$',report,re.M)
    require(len(matches)==1 and matches[0].lower()==pin.lower(),'SIGNER','APK signer differs from pinned publisher')
    return matches[0].lower()

def validate_manifest(xml,package):
    require(isinstance(package,str) and PACKAGE.fullmatch(package) and isinstance(xml,str) and len(xml)<=1024**2 and '<!DOCTYPE' not in xml.upper() and '<!ENTITY' not in xml.upper(),'MANIFEST','Invalid manifest input')
    try: root=ET.fromstring(xml)
    except ET.ParseError as e:raise RuntimeErrorCode('MANIFEST','Cannot parse APK manifest') from e
    require(root.tag=='manifest' and root.get('package')==package,'MANIFEST','APK identity mismatch')
    for element in root:
        if element.tag.startswith('uses-permission'):
            permission=element.get(NS+'name','');require(permission.rsplit('.',1)[-1] not in DENIED,'PERMISSION','Excessively privileged permission')
    apps=root.findall('application');require(len(apps)==1,'MANIFEST','Expected one application');app=apps[0]
    require(app.get(NS+'debuggable','false')=='false' and app.get(NS+'testOnly','false')=='false','MANIFEST','Debug/test APK denied')
    launcher=[]
    for comp in app:
        if comp.tag not in ('activity','activity-alias','service','receiver','provider'):continue
        name=comp.get(NS+'name');exported=comp.get(NS+'exported');filters=comp.findall('intent-filter')
        require(isinstance(name,str) and CLASS.fullmatch(name),'MANIFEST','Invalid component name')
        main=comp.tag=='activity' and any(any(a.get(NS+'name')=='android.intent.action.MAIN' for a in f.findall('action')) and any(c.get(NS+'name')=='android.intent.category.LAUNCHER' for c in f.findall('category')) for f in filters)
        if main:
            require(exported=='true','MANIFEST','Launcher not exported');launcher.append(package+'/'+name)
        else:require(exported=='false' or (exported is None and not filters and comp.tag!='provider'),'MANIFEST','Unexpected exported component')
    require(len(launcher)==1 and launcher[0].split('/',1)[1].rsplit('.',1)[-1]=='MainActivity','MANIFEST','Expected unique Tauri MainActivity launcher')
    return launcher[0]

def lifecycle_check(adb,component,sleep=time.sleep):
    pkg,sep,activity=component.partition('/')
    require(sep and PACKAGE.fullmatch(pkg) and activity in ('.MainActivity',pkg+'.MainActivity'),'IDENTITY','Invalid component')
    def call(args):
        code,out=adb(args);require(code==0 and isinstance(out,str),'ADB','Device command failed: '+args[1]);return out
    require(call(['shell','getprop','ro.product.cpu.abi']).strip()=='arm64-v8a','ABI','Target is not ARM64')
    pids=[]
    for _ in range(2):
        started=call(['shell','am','start','-W','-n',component]);require(re.search(r'^Status: ok\s*$',started,re.M) is not None and re.search(r'^Activity: '+re.escape(component)+r'\s*$',started,re.M) is not None,'ADB','Launcher did not report expected activity')
        value=call(['shell','pidof',pkg]).strip();require(re.fullmatch(r'[1-9][0-9]*(?: [1-9][0-9]*)*',value) is not None,'ADB','Invalid or absent app PID');pids.append([int(x) for x in value.split()])
        call(['shell','am','force-stop',pkg])
        for attempt in range(10):
            code,out=adb(['shell','pidof',pkg]);
            if code==1 and not out.strip():break
            require(code==0 and re.fullmatch(r'[1-9][0-9]*(?: [1-9][0-9]*)*',out.strip()) is not None,'ADB','Cannot prove process exit');sleep(.2)
        else:raise RuntimeErrorCode('ADB','Process still running after deadline')
    return {'state':'PASS','component':component,'pids':pids,'scope':'launch, force-stop, second launch, force-stop; not application state recovery'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('serial');p.add_argument('apk',type=Path);p.add_argument('package');p.add_argument('signer_sha256');p.add_argument('--confirm-force-stop',action='store_true');a=p.parse_args()
    def run(args):
        r=subprocess.run(args,capture_output=True,text=True,timeout=30);return r.returncode,r.stdout if r.returncode==0 else r.stdout+r.stderr
    try:
        require(a.confirm_force_stop and re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',a.serial),'AUTH','Explicit target and force-stop confirmation required')
        require(a.apk.is_file() and not a.apk.is_symlink(),'APK','Invalid local APK')
        code,report=run(['apksigner','verify','--print-certs',str(a.apk)]);require(code==0,'SIGNER','APK signature verification failed');verify_signer(report,a.signer_sha256)
        code,xml=run(['apkanalyzer','manifest','print',str(a.apk)]);require(code==0,'MANIFEST','Manifest analyzer failed');component=validate_manifest(xml,a.package)
        def adb(args):return run(['adb','-s',a.serial,*args])
        code,out=adb(['shell','pm','path',a.package]);lines=out.strip().splitlines();require(code==0 and len(lines)==1 and re.fullmatch(r'package:/data/app/[A-Za-z0-9_./=+-]+/base\.apk',lines[0]) and '..' not in lines[0],'APK','Single installed base APK required')
        with tempfile.TemporaryDirectory() as temp:
            installed=Path(temp)/'base.apk';code,_=adb(['pull',lines[0][8:],str(installed)]);require(code==0 and installed.is_file(),'APK','Cannot retrieve installed APK')
            with installed.open('rb') as x,a.apk.open('rb') as y:require(hashlib.file_digest(x,'sha256').digest()==hashlib.file_digest(y,'sha256').digest(),'APK','Installed APK differs from verified artifact')
        print(json.dumps(lifecycle_check(adb,component),indent=2));return 0
    except (RuntimeErrorCode,OSError,ValueError,subprocess.SubprocessError) as e:p.exit(1,str(e)+'\n')
if __name__=='__main__':raise SystemExit(main())
