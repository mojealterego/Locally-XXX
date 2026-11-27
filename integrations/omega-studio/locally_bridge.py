"""Bounded, data-only adapter for the vendored Omega Studio primitives."""
import json
import math
import os
from dataclasses import asdict
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / 'backend'))
from omega_actions.ultimate.agent_dag import Task, validate_plan
from omega_actions.ultimate.cinematic_timebase import FrameRate
from omega_actions.ultimate.mobile_tile_planner import MemoryProfile, plan_tiles

from omega_actions.ultimate.geodepth_contract import CameraIntrinsics, DepthDefinition

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


def finite(value, low, high):
    if type(value) not in (int, float) or not low <= value <= high or not math.isfinite(value):
        raise ValueError('Number out of bounds')
    return float(value)


def geometry(v):
    exact(v, 'operation,camera,crop,point')
    c = v['camera']
    exact(c, 'fx,fy,cx,cy,width,height,skew')
    camera = CameraIntrinsics(fx=finite(c['fx'], 0.001, 1000000), fy=finite(c['fy'], 0.001, 1000000),
                              cx=finite(c['cx'], -1000000, 1000000), cy=finite(c['cy'], -1000000, 1000000),
                              width=integer(c['width'], 1, 32768), height=integer(c['height'], 1, 32768),
                              skew=finite(c['skew'], -1000000, 1000000))
    if v['crop'] is not None:
        r = v['crop']
        exact(r, 'x,y,width,height,outWidth,outHeight')
        camera = camera.crop_resize(integer(r['x'], 0, 32767), integer(r['y'], 0, 32767),
                                    *[integer(r[k], 1, 32768) for k in ('width', 'height', 'outWidth', 'outHeight')])
    p = v['point']
    exact(p, 'u,v,depth,kind')
    kind = DepthDefinition(p['kind'])
    xyz = camera.backproject(finite(p['u'], 0, camera.width - 1), finite(p['v'], 0, camera.height - 1),
                             finite(p['depth'], 0.000001, 1000000), kind)
    if not all(math.isfinite(x) for x in xyz):
        raise ValueError('Nonfinite projection')
    return {'camera': asdict(camera), 'xyz': xyz, 'depth_definition': kind.value,
            'unit': 'arbitrary_scale', 'measurement_verified': False}


def blend(v):
    exact(v, 'operation,shape,axis,left,right')
    if type(v['shape']) is not list or len(v['shape']) not in (2, 3):
        raise ValueError('Invalid shape')
    shape = [integer(n, 1, 1024) for n in v['shape']]
    count = math.prod(shape)
    axis = integer(v['axis'], 0, 1)
    if count > 1024 or shape[axis] < 2 or (len(shape) == 3 and shape[2] not in (1, 3, 4)):
        raise ValueError('Invalid overlap')
    strips = []
    for name in ('left', 'right'):
        if type(v[name]) is not list or len(v[name]) != count:
            raise ValueError('Invalid strip')
        strips.append([finite(x, -1000000, 1000000) for x in v[name]])
    import numpy as np
    from omega_actions.ultimate.c2_blending import c2_crossfade
    a, b = [np.asarray(s, dtype=np.float64).reshape(shape) for s in strips]
    pixels = c2_crossfade(a, b, axis=axis)
    return {'shape': shape, 'axis': axis, 'pixels': pixels.ravel().tolist(),
            'color_space': 'caller_supplied_linear', 'whole_image_processed': False}


def ast_compare(v):
    exact(v, 'operation,left,right,dimensions')
    for name in ('left', 'right'):
        if type(v[name]) is not str or not v[name].strip() or len(v[name].encode('utf-8')) > 12000:
            raise ValueError('Invalid source')
    from omega_actions.ultimate.quantum_ast import ASTResonator
    engine = ASTResonator(integer(v['dimensions'], 8, 4096))
    try:
        a, b = engine.embed(v['left']), engine.embed(v['right'])
    except SyntaxError as exc:
        raise ValueError('Invalid Python syntax') from exc
    similarity = engine.similarity(a, b)
    return {'similarity': similarity, 'projection': engine.project(a, b),
            'scope': 'classical_cpu_structural_heuristic', 'semantic_equivalence_verified': False,
            'formal_proof': False}


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
    elif op == 'geometry':
        result = geometry(v)
    elif op == 'blend':
        result = blend(v)
    elif op == 'ast-compare':
        result = ast_compare(v)
    elif op == 'checkpoint-audit':
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from checkpoint_audit import inspect_checkpoint
        result = inspect_checkpoint(v, os.environ.get('OMEGA_STUDIO_MODEL_DIR'))
    elif op == 'ci-compile':
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from ci_compile_bridge import compile_snapshot
        result = compile_snapshot(v)
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
