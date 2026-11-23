import pytest
from oxa_ref.validation import strict_json_output,OutputError

SCHEMA={'$schema':'https://json-schema.org/draft/2020-12/schema','type':'object','required':['value'],'additionalProperties':False,'properties':{'value':{'type':'integer'}}}
def test_valid():assert strict_json_output('{"value":1}',SCHEMA)=={'value':1}

def test_duplicate_json_keys_rejected():
    with pytest.raises(OutputError,match='duplicate'):strict_json_output('{"value":1,"value":2}',SCHEMA)

def test_wrong_type_rejected():
    with pytest.raises(OutputError,match='schema'):strict_json_output('{"value":"1"}',SCHEMA)

def test_unknown_extra_rejected():
    with pytest.raises(OutputError):strict_json_output('{"value":1,"bad":0}',SCHEMA)

def test_nonfinite_rejected():
    with pytest.raises(OutputError):strict_json_output('{"value":NaN}',SCHEMA)

def test_multiple_documents_rejected():
    with pytest.raises(OutputError):strict_json_output('{"value":1}{"value":2}',SCHEMA)

def test_payload_budget():
    with pytest.raises(OutputError,match='length'):strict_json_output('"'+('x'*300)+'"',SCHEMA,max_bytes=50)

def test_invalid_schema_rejected():
    with pytest.raises(OutputError,match='schema'):strict_json_output('{}',{'type':'invented'})
