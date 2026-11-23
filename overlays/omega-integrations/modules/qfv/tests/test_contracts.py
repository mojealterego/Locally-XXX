import json
from pathlib import Path
import unittest
import jsonschema

ROOT=Path(__file__).resolve().parents[1]

class SchemaContracts(unittest.TestCase):
    def test_rig_schema_compiles_and_example_valid(self):
        schema=json.loads((ROOT/'contracts/qfv-rig.schema.json').read_text())
        jsonschema.Draft202012Validator.check_schema(schema)
        jsonschema.validate(json.loads((ROOT/'examples/sample-rig.json').read_text()),schema)

    def test_frame_schema_compiles_and_example_valid(self):
        schema=json.loads((ROOT/'contracts/qfv-frame.schema.json').read_text())
        jsonschema.Draft202012Validator.check_schema(schema)
        jsonschema.validate(json.loads((ROOT/'examples/sample-frame.json').read_text()),schema)

    def test_quality_schema_compiles(self):
        schema=json.loads((ROOT/'contracts/qfv-quality.schema.json').read_text())
        jsonschema.Draft202012Validator.check_schema(schema)
        jsonschema.validate({'schemaVersion':'1.0.0','profile':'MOBILE_FULL','p95FrameMs':12,'thermalPressure':0.2,'memoryPressure':0.2},schema)

    def test_frame_rejects_missing_consent(self):
        schema=json.loads((ROOT/'contracts/qfv-frame.schema.json').read_text())
        data=json.loads((ROOT/'examples/sample-frame.json').read_text());del data['consent']
        with self.assertRaises(jsonschema.ValidationError):jsonschema.validate(data,schema)

    def test_rig_rejects_malformed_radius(self):
        schema=json.loads((ROOT/'contracts/qfv-rig.schema.json').read_text())
        data=json.loads((ROOT/'examples/sample-rig.json').read_text());data['actuators'][0]['radius']=-1
        with self.assertRaises(jsonschema.ValidationError):jsonschema.validate(data,schema)

    def test_quality_rejects_invalid_pressure(self):
        schema=json.loads((ROOT/'contracts/qfv-quality.schema.json').read_text())
        data={'schemaVersion':'1.0.0','profile':'MOBILE_FULL','p95FrameMs':12,'thermalPressure':9,'memoryPressure':0.1}
        with self.assertRaises(jsonschema.ValidationError):jsonschema.validate(data,schema)

if __name__ == '__main__': unittest.main()

class LandmarkCountContracts(unittest.TestCase):
    def test_mediapipe_478_rejects_68_point_payload(self):
        schema=json.loads((ROOT/'contracts/qfv-frame.schema.json').read_text())
        data=json.loads((ROOT/'examples/sample-frame.json').read_text())
        data['landmarkSet']='mediapipe-478'
        with self.assertRaises(jsonschema.ValidationError):jsonschema.validate(data,schema)
