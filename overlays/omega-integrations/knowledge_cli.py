#!/usr/bin/env python3
"""Local-only OTCM/ATM knowledge reconciliation gateway. No tool execution or durable memory."""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from knowledge_bridge import reconcile_as_of, KnowledgeBridgeError

MAX_INPUT = 65536

def main() -> int:
    try:
        source = sys.stdin.buffer.read(MAX_INPUT + 1)
        if len(source) > MAX_INPUT:
            raise KnowledgeBridgeError('INPUT_TOO_LARGE')
        request = json.loads(source)
        if type(request) is not dict:
            raise KnowledgeBridgeError('INVALID_REQUEST')
        output = reconcile_as_of(request)
        if output.get('action_executed') is not False or output.get('memory_persisted') is not False or output.get('proof_state') != 'NO_CHECKED_PROOF':
            raise KnowledgeBridgeError('UNTRUSTED_EXECUTION_STATUS')
        print(json.dumps(output, ensure_ascii=False, allow_nan=False, separators=(',', ':')))
        return 0
    except (KnowledgeBridgeError, ValueError, TypeError, KeyError) as e:
        print(json.dumps({'status': 'DENIED', 'code': getattr(e, 'args', ['INVALID_REQUEST'])[0]}), file=sys.stderr)
        return 2

if __name__ == '__main__':
    raise SystemExit(main())
