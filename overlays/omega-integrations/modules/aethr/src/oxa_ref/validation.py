"""Post-decode JSON Schema validation; does not mask token logits."""
from __future__ import annotations
import json
import jsonschema
class OutputError(ValueError):pass

def _pairs_without_duplicates(pairs):
    obj={}
    for k,v in pairs:
        if k in obj:raise OutputError(f'duplicate JSON key: {k}')
        obj[k]=v
    return obj

def _no_nonfinite(s):raise OutputError('non-finite JSON number')

def strict_json_output(payload:str,schema:dict,max_bytes:int=1024*1024):
    if not isinstance(payload,str) or len(payload.encode('utf-8'))>max_bytes:
        raise OutputError('invalid payload length')
    try:jsonschema.Draft202012Validator.check_schema(schema)
    except jsonschema.SchemaError as exc:raise OutputError('invalid schema') from exc
    try:value=json.loads(payload,object_pairs_hook=_pairs_without_duplicates,parse_constant=_no_nonfinite)
    except OutputError:
        raise
    except (ValueError,TypeError) as exc:raise OutputError('invalid JSON document') from exc
    try:jsonschema.Draft202012Validator(schema).validate(value)
    except jsonschema.ValidationError as exc:raise OutputError('schema validation failed') from exc
    return value
