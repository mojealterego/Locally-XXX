"""Local approved syntax checks on disposable data-only source snapshots."""
import hashlib
import json
from pathlib import Path
import re
import secrets
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent / 'backend'))
from omega_actions.ultimate.adaptive_ci import AdaptiveCI
from omega_actions.ultimate.ci_singularity import AdaptiveCIGate


_RESERVED = {'con','prn','aux','nul', *(f'com{i}' for i in range(1,10)), *(f'lpt{i}' for i in range(1,10))}


def compile_snapshot(v):
    if (type(v) is not dict or set(v) != {'operation','approved','files'}
            or v['operation'] != 'ci-compile' or v['approved'] is not True
            or type(v['files']) is not list or not 1 <= len(v['files']) <= 16):
        raise ValueError('Explicit approval and source snapshot required')
    sources, seen, size = {}, set(), 0
    for f in v['files']:
        if (type(f) is not dict or set(f) != {'name','source'} or type(f['name']) is not str
                or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,63}\.py', f['name'])
                or f['name'][:-3].lower() in _RESERVED or f['name'].lower() in seen
                or type(f['source']) is not str or '\0' in f['source']):
            raise ValueError('Invalid source entry')
        data = f['source'].encode('utf-8')
        size += len(data)
        if size > 24576:
            raise ValueError('Source budget exceeded')
        seen.add(f['name'].lower())
        sources[f['name']] = data
    manifest = [{'name':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
                for name,data in sorted(sources.items())]
    snapshot = hashlib.sha256(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    with tempfile.TemporaryDirectory(prefix='omega-ci-') as temp:
        workspace = Path(temp).resolve()
        for name,data in sources.items():
            with (workspace/name).open('xb') as f:
                f.write(data)
        ci = AdaptiveCI(workspace,secret=secrets.token_bytes(32))
        plan = ci.propose_python_compile()
        gate = AdaptiveCIGate(workspace,signing_key=secrets.token_bytes(32))
        proposal = gate.propose('syntax-check',plan['argv'],max_seconds=3)
        receipt = gate.approve(proposal,approval='approve:syntax-check')
        if not gate.verify(receipt):
            raise ValueError('Approval receipt rejected')
        approval = ci.approve(plan,operator_confirmed=True)
        result = ci.execute(plan,approval=approval,timeout=3)
        return {'status':'PASS' if result['returncode']==0 else 'FAIL',
                'returncode':result['returncode'],'snapshot_sha256':snapshot,'files':manifest,
                'approval_verified':True,'persistent_approval':False,
                'stdout':result['stdout'].replace(str(workspace),'<snapshot>'),
                'stderr':result['stderr'].replace(str(workspace),'<snapshot>'),
                'compiler_executed':True,'source_executed':False,'tests_executed':False,'deployed':False,
                'scope':'local_disposable_python_syntax_check'}
