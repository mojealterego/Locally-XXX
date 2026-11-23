import json,sys
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator, ValidationError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from omega_firefly.core import VideoPrompt, ElementReference, ColorAdjustments
ROOT=Path(__file__).resolve().parents[1]
SCHEMAS={p.stem.replace('.schema',''):json.loads(p.read_text('utf8')) for p in (ROOT/'schemas').glob('*.schema.json')}

@pytest.mark.parametrize('schema_name',sorted(['element','video','color','mask','effect','crop','retouch']))
def test_json_schema_is_valid(schema_name):
    Draft202012Validator.check_schema(SCHEMAS[schema_name])

def test_valid_video_roundtrip_and_offsets():
    c=VideoPrompt('Klatka z @Red-Fox i @Old-Town.',[ElementReference('a','Red-Fox'),ElementReference('b','Old-Town')]).compile()
    Draft202012Validator(SCHEMAS['video']).validate(c)
    for m in c['mentions']:
        assert c['prompt'][m['start']:m['end']]==m['text']

def test_invalid_element_requires_rights_and_max_five():
    e={'element_id':'id','kind':'CHARACTER','canonical_name':'Fox','refs':[{'uri':'asset://x','sha256':'0'*64,'rights_confirmed':True}], 'owner':'u','project_scope':'p','revision':1,'is_stale':False}
    Draft202012Validator(SCHEMAS['element']).validate(e)
    e['refs'][0]['rights_confirmed']=False
    with pytest.raises(ValidationError):Draft202012Validator(SCHEMAS['element']).validate(e)

def test_color_serialization_and_reject_extra():
    obj={'tempA':1,'tempB':-3,'tempLuminance':2,'vibrance':.5,'highlights':-.2}
    Draft202012Validator(SCHEMAS['color']).validate(obj)
    obj['arbitrary']='injection'
    with pytest.raises(ValidationError):Draft202012Validator(SCHEMAS['color']).validate(obj)

def test_crop_normalized_and_invalid():
    good={'bounds':[0,.1,.8,.9],'focus':'face','alignX':.33,'alignY':.66,'margin':[0,0,0,0],'straighten':'auto','mode':'extract'}
    Draft202012Validator(SCHEMAS['crop']).validate(good)
    good['bounds'][0]=-1
    with pytest.raises(ValidationError):Draft202012Validator(SCHEMAS['crop']).validate(good)

def test_slider_metadata_has_18_effects_and_sane_bounds():
    registry=json.loads((ROOT/'schemas'/'effect-sliders.json').read_text('utf8'))
    assert len(registry)==18
    for sliders in registry.values():
        for v in sliders.values():assert v['min']<=v['default']<=v['max']

def test_documented_video_offsets_are_correct():
    c=VideoPrompt('Scena z @Red-Fox przed @Old-Town.',[ElementReference('char-1','Red-Fox'),ElementReference('place-2','Old-Town')]).compile()
    assert [(x['start'],x['end']) for x in c['mentions']]==[(8,16),(23,32)]
