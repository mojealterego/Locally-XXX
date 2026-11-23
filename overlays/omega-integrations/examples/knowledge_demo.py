"""Demonstrate contradiction-aware knowledge reconciliation; no action executes."""
from pathlib import Path
import json
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from knowledge_bridge import reconcile_as_of
x={'schema_version':'omega.knowledge.integration.v1','tenant_id':'demo_tenant','agent_id':'agent_01',
   'valid_at':20,'known_at':25,
   'events':[{'claim':'safe-to-deploy','asserts_true':True,'valid_from':10,'valid_to':100,'recorded_at':12,'source':'source-A'},
             {'claim':'safe-to-deploy','asserts_true':False,'valid_from':10,'valid_to':100,'recorded_at':13,'source':'source-B'}],
   'action':{'id':'deploy','sensitivity':'write','tool_name':'production_release','required_claims':['safe-to-deploy'],
             'contract_id':'release-v1','source_sha256':'a'*64,'utility':1.0}}
print(json.dumps(reconcile_as_of(x),indent=2))
