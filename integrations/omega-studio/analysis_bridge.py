"""Bounded static analysis and disposable MCP configuration validation."""
import json
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent / 'backend'))
from omega_actions.ultimate.code_swarm import analyze_source
from omega_actions.ultimate.mcp_registry import MCPRegistry, MCPServer


def analyze(v):
    if (type(v) is not dict or set(v) != {'operation','source','mode'}
            or v['operation'] != 'code-review' or type(v['source']) is not str
            or not v['source'].strip() or '\0' in v['source']
            or len(v['source'].encode('utf-8')) > 12000
            or v['mode'] not in ('leak','duo')):
        raise ValueError('Invalid analysis request')
    report = analyze_source(v['source'], mode=v['mode'], suggest_repair=False)
    findings = report['findings']
    return {**{k:report[k] for k in ('mode','syntax_valid','sha256','analyzers')},
            'ast_reparsed':report['verified'], 'finding_count':len(findings),
            'findings':findings[:128], 'findings_truncated':len(findings)>128,
            'scope':'deterministic_static_heuristics', 'source_executed':False,
            'security_verified':False, 'semantic_equivalence_verified':False}


def validate_registry(v):
    if (type(v) is not dict or set(v) != {'operation','servers'}
            or v['operation'] != 'mcp-validate' or type(v['servers']) is not list
            or len(v['servers']) > 32):
        raise ValueError('Invalid registry request')
    if len(json.dumps(v,ensure_ascii=False).encode('utf-8')) > 32768:
        raise ValueError('Registry size limit')
    servers, names = [], set()
    for item in v['servers']:
        if (type(item) is not dict or set(item) != {'name','transport','command','url'}
                or type(item['name']) is not str or type(item['transport']) is not str
                or type(item['command']) is not list or len(item['command']) > 16
                or any(type(a) is not str or not a or len(a)>256 or any(ord(c)<32 or ord(c)==127 for c in a) for a in item['command'])
                or type(item['url']) is not str or len(item['url'])>2048
                or urlsplit(item['url']).query or '?' in item['url']
                or item['name'] in names):
            raise ValueError('Invalid registry entry')
        server = MCPServer(item['name'], item['transport'], tuple(item['command']), item['url'])
        names.add(server.name)
        servers.append(server)
    # Exercise the original registry on a private disposable snapshot only.
    with tempfile.TemporaryDirectory(prefix='omega-mcp-') as tmp:
        registry = MCPRegistry(Path(tmp))
        for server in servers:
            registry.put(server)
        loaded = registry.list()
        if loaded != sorted(servers,key=lambda server:server.name):
            raise ValueError('Registry roundtrip mismatch')
        result = [{'name':s.name,'transport':s.transport} for s in loaded]
    return {'servers':result, 'count':len(result), 'schema_valid':True,
            'persisted':False, 'connected':False, 'commands_executed':False,
            'endpoint_security_verified':False, 'scope':'disposable_configuration_validation'}
