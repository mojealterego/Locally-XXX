import csv
import json
import re
import unittest
from pathlib import Path
from jsonschema import Draft202012Validator, ValidationError

ROOT=Path(__file__).resolve().parents[1]

def schema(name):
    return json.loads((ROOT/'schemas'/name).read_text(encoding='utf-8'))

def workload(**changes):
    base={
        'request_id':'job-123','principal':'owner','mode':'OFFLINE','kind':'INFERENCE',
        'model_ref':'hf://repo/model.gguf','required_ram_mib':1024,
        'max_duration_sec':60,'cloud_egress_requested':False,
        'estimated_cost_usd':0,'allow_payment':False,'checkpoint_required':True
    }
    return {**base,**changes}

class DocumentContractTests(unittest.TestCase):
    def test_schema_valid_draft202012(self):
        for n in ('workload.schema.json','device_observation.schema.json'):
            Draft202012Validator.check_schema(schema(n))
    def test_valid_local_request(self):
        Draft202012Validator(schema('workload.schema.json')).validate(workload())
    def test_cloud_mode_requires_valid_mode_literal(self):
        with self.assertRaises(ValidationError):
            Draft202012Validator(schema('workload.schema.json')).validate(workload(mode='ASI'))
    def test_unknown_workload_is_denied(self):
        with self.assertRaises(ValidationError):
            Draft202012Validator(schema('workload.schema.json')).validate(workload(kind='HIDDEN_RESOURCE'))
    def test_cloud_payment_flag_cannot_be_enabled(self):
        with self.assertRaises(ValidationError):
            Draft202012Validator(schema('workload.schema.json')).validate(workload(allow_payment=True))
    def test_missing_checkpoint_requirement_denied(self):
        with self.assertRaises(ValidationError):
            Draft202012Validator(schema('workload.schema.json')).validate(workload(checkpoint_required=False))
    def test_extra_schema_fields_denied(self):
        with self.assertRaises(ValidationError):
            Draft202012Validator(schema('workload.schema.json')).validate(workload(extra=True))
    def test_example_config_disables_hidden_egress(self):
        cfg=json.loads((ROOT/'configs/s24_policy_example.json').read_text())
        self.assertEqual(cfg['default_mode'],'OFFLINE')
        self.assertFalse(cfg['cloud_egress_enabled'])
        self.assertFalse(cfg['edge_donation_default'])
        self.assertFalse(cfg['native_exec_from_writable_app_data'])
        self.assertFalse(cfg['claimed_asi'])
    def test_48_requirements_are_unique_and_contiguous(self):
        with (ROOT/'REQUIREMENTS.csv').open(encoding='utf-8') as f:
            rows=list(csv.DictReader(f))
        self.assertEqual([r['requirement_id'] for r in rows], [f'MOB-{i:03d}' for i in range(1,49)])
    def test_source_documents_include_no_evidence_claim_for_asi(self):
        md=(ROOT/'OMEGA_Mobile_Sovereign_Runtime_Inzynieria_Wdrozenie.md').read_text()
        self.assertIn('nie gwarancję powstania AGI/ASI',md)
        self.assertIn('NOT_RUN',md)
        self.assertIn('GATE-09',md)
        self.assertEqual(len(re.findall(r'^\| MOB-\d{3} \|',md,flags=re.MULTILINE)),48)

if __name__=='__main__':unittest.main()
