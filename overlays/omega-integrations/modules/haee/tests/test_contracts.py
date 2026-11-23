"""Standalone validation of the HAEE specification examples (NOT runtime integration tests)."""
from pathlib import Path
import copy, json, unittest
from jsonschema import Draft202012Validator, FormatChecker
BASE=Path(__file__).resolve().parents[1]

def check(name,document):
    schema=json.loads((BASE/'schemas'/f'haee.{name}.v1.schema.json').read_text())
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(document)

def graph_check(g):
    nodes={n['id']:n for n in g['nodes']}
    if len(nodes)!=len(g['nodes']):raise ValueError('DUPLICATE_NODE')
    if not any(n['kind']=='INPUT' for n in g['nodes']) or not any(n['kind']=='OUTPUT' for n in g['nodes']):raise ValueError('MISSING_IO')
    if len(nodes)>g['limits']['max_nodes'] or len(g['edges'])>g['limits']['max_edges']:raise ValueError('TOO_LARGE')
    indeg={k:0 for k in nodes};children={k:[] for k in nodes}
    for e in g['edges']:
        s,t=e['source'],e['target']
        if s not in nodes or t not in nodes:raise ValueError('DANGLING_EDGE')
        if e['delay_steps']==0:
            if s==t:raise ValueError('CYCLE')
            children[s].append(t);indeg[t]+=1
    queue=[k for k,d in indeg.items() if d==0]
    done=0
    while queue:
        s=queue.pop();done+=1
        for t in children[s]:
            indeg[t]-=1
            if indeg[t]==0:queue.append(t)
    if done!=len(nodes):raise ValueError('CYCLE')
    return True

class ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.g=json.loads((BASE/'examples/genome.json').read_text());cls.e=json.loads((BASE/'examples/experiment.json').read_text())
    def test_genome_example(self):check('genome',self.g)
    def test_experiment_example(self):check('experiment',self.e)
    def test_graph_contract(self):self.assertTrue(graph_check(self.g))
    def test_duplicate_node(self):
        g=copy.deepcopy(self.g);g['nodes'].append(copy.deepcopy(g['nodes'][0]))
        with self.assertRaisesRegex(ValueError,'DUPLICATE'):graph_check(g)
    def test_invalid_cycle(self):
        g=copy.deepcopy(self.g);g['edges'].append({'source':'output','target':'input','delay_steps':0})
        with self.assertRaisesRegex(ValueError,'CYCLE'):graph_check(g)
    def test_invalid_optimizer(self):
        g=copy.deepcopy(self.g);g['training']['optimizer']='ARBITRARY_CODE'
        with self.assertRaises(Exception):check('genome',g)
    def test_invalid_dataset_sha(self):
        e=copy.deepcopy(self.e);e['dataset']['train_sha256']='secret'
        with self.assertRaises(Exception):check('experiment',e)
    def test_forbid_self_approval_policy(self):
        e=copy.deepcopy(self.e);e['approval_policy']='AUTO_PROMOTE'
        with self.assertRaises(Exception):check('experiment',e)
    def test_invalid_number_of_objectives(self):
        e=copy.deepcopy(self.e);e['objective_ids']=['TASK_ERROR']
        with self.assertRaises(Exception):check('experiment',e)
    def test_invalid_unknown_scope(self):
        g=copy.deepcopy(self.g);g['unrestricted_root_access']=True
        with self.assertRaises(Exception):check('genome',g)

if __name__=='__main__':unittest.main()
