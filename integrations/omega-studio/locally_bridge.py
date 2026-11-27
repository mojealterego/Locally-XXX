"""Bounded, data-only adapter for the vendored Omega Studio primitives."""
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / 'backend'))
from omega_actions.ultimate.agent_dag import Task, validate_plan
from omega_actions.ultimate.cinematic_timebase import FrameRate
from omega_actions.ultimate.mobile_tile_planner import MemoryProfile, plan_tiles

CAPABILITIES = frozenset(('analyze', 'plan', 'verify', 'report'))
MIB = 1024 * 1024


def exact(value, keys):
    if type(value) is not dict or set(value) != set(keys.split(',')):
        raise ValueError('Invalid object')


def integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ValueError('Integer out of bounds')
    return value


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}', value):
        raise ValueError('Invalid identifier')
    return value


def evaluate(v):
    if type(v) is not dict:
        raise ValueError('Invalid request')
    op = v.get('operation')
    if op == 'dag':
        exact(v, 'operation,tasks')
        if type(v['tasks']) is not list or not 1 <= len(v['tasks']) <= 128:
            raise ValueError('Invalid tasks')
        tasks = []
        for t in v['tasks']:
            exact(t, 'id,capability,dependencies,cost')
            if type(t['dependencies']) is not list or len(t['dependencies']) > 128:
                raise ValueError('Invalid dependencies')
            tasks.append(Task(identifier(t['id']), identifier(t['capability']),
                              tuple(map(identifier, t['dependencies'])), integer(t['cost'], 0, 1000)))
        p = validate_plan(tasks, CAPABILITIES, max_tasks=128, max_cost=1000, max_parallel=8)
        result = {'levels': p.levels, 'total_cost': p.total_cost}
    elif op == 'timeline':
        exact(v, 'operation,numerator,denominator,frame,sampleRate')
        rate = FrameRate(integer(v['numerator'], 1, 240000), integer(v['denominator'], 1, 1001))
        frame = integer(v['frame'], 0, 10000000)
        sr = integer(v['sampleRate'], 8000, 192000)
        time = rate.frame_time(frame)
        start, end = rate.audio_sample_window(frame, sr)
        result = {'timeNumerator': time.numerator, 'timeDenominator': time.denominator,
                  'startSample': start, 'endSample': end}
    elif op == 'tiles':
        exact(v, 'operation,width,height,tileSize,halo,ramMiB,reservedMiB,capMiB')
        w, h = integer(v['width'], 1, 32768), integer(v['height'], 1, 32768)
        memory = MemoryProfile(integer(v['ramMiB'], 512, 131072) * MIB,
                               integer(v['reservedMiB'], 0, 131071) * MIB, 0,
                               integer(v['capMiB'], 1, 4096) * MIB)
        tiles = plan_tiles(w, h, tile_size=integer(v['tileSize'], 64, 2048),
                           halo=integer(v['halo'], 0, 128), memory=memory, max_tiles=4096)
        result = {'count': len(tiles), 'corePixels': sum(t.core.width * t.core.height for t in tiles),
                  'peakBytes': max(t.working_set_bytes for t in tiles), 'availableBytes': memory.available_bytes}
    else:
        raise ValueError('Unknown operation')
    return {'schema': 'omega.studio.bridge.v1', 'operation': op, 'executed': False, 'result': result}


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(32769)
        if len(raw) > 32768:
            raise ValueError('Input limit')
        print(json.dumps(evaluate(json.loads(raw.decode('utf-8'))), allow_nan=False))
    except (ValueError, TypeError, OverflowError, RecursionError):
        sys.exit(2)
