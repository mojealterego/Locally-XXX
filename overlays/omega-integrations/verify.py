#!/usr/bin/env python3
"""Strict offline verification for pinned reference modules and integrated bridge.
Runs real host tests. Does not assert real GPU/Android/rendering integrations.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

BASE = Path(__file__).resolve().parent
SUITES = [
    ('omega-bridge', '.', ['node', '--test', 'tests/bridge.test.mjs']),
    ('aether-studio', 'modules/studio', ['node', '--test', 'tests/control.test.mjs', 'tests/schema.test.mjs']),
    ('p10-cinema', 'modules/cinema', ['node', '--test', 'tests/core.test.mjs', 'tests/cli.test.mjs']),
    ('p09-firefly', 'modules/firefly', [sys.executable, '-m', 'pytest', '-q', 'tests']),
    ('qfv', 'modules/qfv', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-q']),
    ('aethr', 'modules/aethr', [sys.executable, '-m', 'pytest', '-q', 'tests']),
    ('inference', 'modules/inference', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-q']),
    ('otcm', 'modules/otcm', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-q']),
    ('atm', 'modules/atm', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-q']),
    ('mobile-policy', 'modules/mobile', [sys.executable, '-m', 'unittest', 'reference.test_policy', '-q']),
    ('mobile-contracts', 'modules/mobile', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-q']),
    ('attention', 'modules/attention', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-q']),
    ('haee', 'modules/haee', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py', '-q']),
    ('omegos-contracts', 'modules/omegos', [sys.executable, '-m', 'unittest', 'discover', '-s', 'verification', '-p', 'test_*.py', '-q']),
]


def check_import_lock() -> tuple[int, str]:
    lock=json.loads((BASE/'SOURCE_LOCK.json').read_text(encoding='utf-8'))
    seen=set()
    for f in lock['files']:
        name=f['path']
        if name.startswith('/') or '..' in Path(name).parts or name in seen:
            raise ValueError('Invalid lock path')
        seen.add(name)
        item=(BASE/name)
        if not item.is_file() or item.is_symlink():
            raise ValueError('Missing or symlinked pinned source: '+name)
        if hashlib.sha256(item.read_bytes()).hexdigest()!=f['sha256']:
            raise ValueError('Pinned source changed: '+name)
    return len(seen),lock['lock_sha256']


def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument('--json-report',help='Optional output path for report')
    args=parser.parse_args()
    try: n,locked=check_import_lock()
    except (OSError,ValueError,KeyError) as e:
        print('SOURCE_LOCK FAIL:',e,file=sys.stderr)
        return 1
    records=[]
    for name,cwd,cmd in SUITES:
        root=BASE/cwd
        env=os.environ.copy()
        env['PYTHONPATH']=os.pathsep.join([str(root/'src'),str(root),env.get('PYTHONPATH','')])
        try:
            p=subprocess.run(cmd,cwd=root,env=env,capture_output=True,text=True,timeout=120,check=False)
            output=p.stdout+'\n'+p.stderr
            rec={'suite':name,'exit_code':p.returncode,'command':' '.join(cmd),'stdout_tail':output[-1400:]}
        except (OSError,subprocess.TimeoutExpired) as e:
            rec={'suite':name,'exit_code':127,'command':' '.join(cmd),'stdout_tail':str(e)}
        records.append(rec)
        print(f'{name}: {"PASS" if rec["exit_code"]==0 else "FAIL"}')
    report={'source_integrity':'PASS','locked_files':n,'source_lock_sha256':locked,'suites':records,'all_pass':all(r['exit_code']==0 for r in records),
            'scope':'Host code and contract tests only; no real GPU, inference, mobile device, renderer or engine integration'}
    if args.json_report:
        p=Path(args.json_report);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    print('RESULT:', 'PASS' if report['all_pass'] else 'FAIL')
    return 0 if report['all_pass'] else 1

if __name__=='__main__':raise SystemExit(main())
