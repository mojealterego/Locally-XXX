"""Schema validation only: verifies JSON fixtures, not live inference/transport."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]


class SchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.request_schema = json.loads((ROOT / "schemas/inference_request.schema.json").read_text())
        cls.runtime_schema = json.loads((ROOT / "schemas/runtime_capabilities.schema.json").read_text())
        cls.request = json.loads((ROOT / "schemas/inference_request.example.json").read_text())
        Draft202012Validator.check_schema(cls.request_schema)
        Draft202012Validator.check_schema(cls.runtime_schema)

    def test_reference_request_valid(self):
        Draft202012Validator(self.request_schema).validate(self.request)

    def test_private_mode_and_unknown_fields_are_not_silently_accepted(self):
        value = deepcopy(self.request)
        value["execution_mode"] = "ANY"
        self.assertFalse(Draft202012Validator(self.request_schema).is_valid(value))
        value["execution_mode"] = "OFFLINE"
        value["developer_extra"] = "ignored"
        self.assertFalse(Draft202012Validator(self.request_schema).is_valid(value))

    def test_limits_must_be_bounded(self):
        value = deepcopy(self.request)
        value["limits"]["max_output_tokens"] = -1
        self.assertFalse(Draft202012Validator(self.request_schema).is_valid(value))

    def test_tool_content_rejected_as_arbitrary_object(self):
        value = deepcopy(self.request)
        value["input"]["messages"][0]["content"] = {"untrusted_tool":"call"}
        self.assertFalse(Draft202012Validator(self.request_schema).is_valid(value))

    def test_runtime_requires_tenant_scope(self):
        runtime = {
            "schema_version":"1.0", "runtime_id":"llama-android-1", "engine":"llama.cpp",
            "deployment":"ON_DEVICE", "model_ref":"local:qwen-gguf", "model_format":"GGUF",
            "capabilities":["CHAT", "STREAMING"], "allowed_data_classes":["PRIVATE"],
            "tenant_allowlist":["tenant-demo"], "healthy":True,"memory_headroom_mib":1200,
            "version_pinned":True
        }
        self.assertTrue(Draft202012Validator(self.runtime_schema).is_valid(runtime))
        del runtime["tenant_allowlist"]
        self.assertFalse(Draft202012Validator(self.runtime_schema).is_valid(runtime))

    def test_runtime_id_malformed_rejected(self):
        runtime = {
            "schema_version":"1.0", "runtime_id":"http://evil.example", "engine":"vllm",
            "deployment":"CLOUD_HPC", "model_ref":"remote:llm", "model_format":"SAFETENSORS",
            "capabilities":["CHAT"], "allowed_data_classes":["PUBLIC"],
            "tenant_allowlist":["tenant-demo"], "healthy":True,"memory_headroom_mib":1200,
            "version_pinned":True
        }
        self.assertFalse(Draft202012Validator(self.runtime_schema).is_valid(runtime))

if __name__ == "__main__":
    unittest.main()
