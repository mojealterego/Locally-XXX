#!/usr/bin/env python3
"""P09 Firefly Elements -> QFV field-deformation CPU bridge.

This is a bounded, ephemeral, non-network pipeline. No video frames, faces or images
are generated. Consumer controls rights and provenance; preview is a list of vectors.
"""
from __future__ import annotations
from pathlib import Path
import hashlib
import json
import math
import sys
from typing import Any

BASE = Path(__file__).resolve().parent
for module in ('firefly', 'qfv'):
    sys.path.insert(0, str(BASE / 'modules' / module / 'src'))

from omega_firefly.core import ElementRegistry, ReferenceImage, VideoPrompt, ElementReference, ContractError
from qfv.engine import Vector3, Mesh, FieldEmitter, FieldDeformer, QFVError

class MediaIntegrationError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _obj(value: Any, code: str) -> dict:
    if type(value) is not dict:
        raise MediaIntegrationError(code)
    return value


def _text(value: Any, code: str, max_len: int = 200) -> str:
    if type(value) is not str or not value.strip() or len(value) > max_len:
        raise MediaIntegrationError(code)
    return value


def _num(value: Any, code: str) -> float:
    if type(value) not in (int, float) or not math.isfinite(value):
        raise MediaIntegrationError(code)
    return float(value)


def _vec(data: Any) -> Vector3:
    if type(data) is not list or len(data) != 3:
        raise MediaIntegrationError('INVALID_VECTOR')
    return Vector3(*(_num(x, 'INVALID_COORDINATE') for x in data))


def compile_media_stage(request: dict) -> dict:
    """Compile one rights-checked Element + QFV deformation as an offline preview."""
    request = _obj(request, 'INVALID_REQUEST')
    if set(request) != {'schema_version','tenant_id','project_id','owner','element','prompt','mesh','time_s'}:
        raise MediaIntegrationError('INVALID_REQUEST_FIELDS')
    if request['schema_version'] != 'omega.media.integration.v1':
        raise MediaIntegrationError('UNSUPPORTED_SCHEMA')
    tenant = _text(request['tenant_id'], 'INVALID_TENANT_ID')
    project = _text(request['project_id'], 'INVALID_PROJECT_ID')
    owner = _text(request['owner'], 'INVALID_OWNER')
    element = _obj(request['element'], 'INVALID_ELEMENT')
    if set(element) != {'kind','name','references'}:
        raise MediaIntegrationError('INVALID_ELEMENT_FIELDS')
    refs = element['references']
    if type(refs) is not list or not 1 <= len(refs) <= 5:
        raise MediaIntegrationError('INVALID_REFERENCE_COUNT')
    parsed_refs = []
    for ref in refs:
        _obj(ref,'INVALID_REFERENCE')
        if set(ref) != {'uri','sha256','rights_confirmed'}:
            raise MediaIntegrationError('INVALID_REFERENCE_FIELDS')
        if type(ref['uri']) is not str or not ref['uri'].startswith('asset://'):
            raise MediaIntegrationError('INVALID_ASSET_URI')
        if type(ref['sha256']) is not str or not ref['sha256']:
            raise MediaIntegrationError('INVALID_ASSET_DIGEST')
        parsed_refs.append(ReferenceImage(ref['uri'],ref['sha256'],ref['rights_confirmed']))
    scope = f'{tenant}:{project}'
    registry = ElementRegistry()
    entry = registry.create(element['kind'],element['name'],parsed_refs,owner,scope)
    prompt = _text(request['prompt'], 'INVALID_PROMPT', 20_000)
    compiled = VideoPrompt(prompt,[ElementReference(entry.element_id,entry.canonical_name)]).compile()
    if not any(x['label']==entry.canonical_name for x in compiled['mentions']):
        raise MediaIntegrationError('MISSING_ELEMENT_MENTION')
    mesh = _obj(request['mesh'],'INVALID_MESH')
    if set(mesh) != {'vertices','emitters'}:
        raise MediaIntegrationError('INVALID_MESH_FIELDS')
    vertices, emitters = mesh['vertices'],mesh['emitters']
    if type(vertices) is not list or not 1 <= len(vertices) <= 1000:
        raise MediaIntegrationError('INVALID_VERTEX_COUNT')
    if type(emitters) is not list or len(emitters) > 64:
        raise MediaIntegrationError('INVALID_EMITTER_COUNT')
    original = Mesh(tuple(_vec(v) for v in vertices))
    defs = []
    for emitter in emitters:
        _obj(emitter, 'INVALID_EMITTER')
        if set(emitter) != {'kind','center','strength','radius','direction','frequency_hz'}:
            raise MediaIntegrationError('INVALID_EMITTER_FIELDS')
        defs.append(FieldEmitter(
            kind=emitter['kind'],center=_vec(emitter['center']),
            strength=_num(emitter['strength'],'INVALID_STRENGTH'),
            radius=_num(emitter['radius'],'INVALID_RADIUS'),
            direction=_vec(emitter['direction']),
            frequency_hz=_num(emitter['frequency_hz'],'INVALID_FREQUENCY')
        ))
    time_s = _num(request['time_s'], 'INVALID_TIME')
    if not 0 <= time_s <= 5: raise MediaIntegrationError('INVALID_TIME')
    result = FieldDeformer(defs, steps=12, max_displacement=5).deform(original,time_s)
    coords = [[v.x,v.y,v.z] for v in result.vertices]
    core = {'schema_version':'omega.media.preview.v1','tenant_id':tenant,'project_id':project,
            'source_owner':owner,'element_id':entry.element_id,'element_revision':entry.revision,
            'reference_hashes':[r.sha256 for r in parsed_refs],
            'video_prompt':compiled,'deformed_vertices':coords,
            'status':'CPU_REFERENCE_PREVIEW_NO_VIDEO_RENDER',
            'rendered_image':False,'generated_video':False,'persistent':False}
    digest = hashlib.sha256(json.dumps(core,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()).hexdigest()
    return {**core,'manifest_sha256':digest}


def main() -> int:
    try:
        data = sys.stdin.buffer.read(512_001)
        if len(data)>512_000: raise MediaIntegrationError('INPUT_TOO_LARGE')
        result = compile_media_stage(json.loads(data))
        print(json.dumps(result,ensure_ascii=False,allow_nan=False))
        return 0
    except (MediaIntegrationError, ContractError, QFVError, ValueError, TypeError, KeyError) as exc:
        print(json.dumps({'status':'DENIED','error':getattr(exc,'code',type(exc).__name__),'reason':str(exc)[:500]}),file=sys.stderr)
        return 2

if __name__ == '__main__': raise SystemExit(main())
