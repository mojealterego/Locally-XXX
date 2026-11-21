export const DEFINITIONS=Object.freeze([
 {id:'awesome-local-llm',entry:'integrations/src/knowledge.mjs',capability:'Pinned knowledge search and optional vector adapter',outstanding:'Live embeddings and pgvector E2E'},
 {id:'awesome-open-source-alternatives',entry:'packages/awesome-benchmarks/benchmark.mjs',capability:'Local Ollama benchmark and provenance-aware comparisons',outstanding:'Cloud cost telemetry and real hardware calibration'},
 {id:'awesome-opensource-app',entry:null,capability:'Native Tauri client integration',outstanding:'Complete native desktop build and validation'},
 {id:'awesome-ai-apps',entry:'ide-studio/compile-app.mjs',capability:'Partial multi-target app generator',outstanding:'Signed multi-platform production builds'},
 {id:'awesome-ai-agents',entry:'backend/src/orchestration/agent-runtime.mjs',capability:'Bounded agent orchestration',outstanding:'Full OCAF and durable runtime'},
 {id:'awesome-ai-devtools',entry:'ide-studio/visual-compiler.mjs',capability:'DAG compiler and IDE integration',outstanding:'Browser/native E2E'},
 {id:'awesome-private-ai',entry:'backend/src/sandbox/gvisor.mjs',capability:'Bounded gVisor adapter',outstanding:'Real Firecracker, gVisor and GPU validation'},
 {id:'awesome-json-fmt',entry:'integrations/src/json-tools.mjs',capability:'Strict local JSON/YAML/ENV formatter',outstanding:'AST pipeline auto-lint integration'},
 {id:'awesome-stundensatz-rechner',entry:'integrations/src/pricing.mjs',capability:'Local billing estimate and optional business MCP',outstanding:'Country-specific tax and project quotations'},
 {id:'awesome-printer-tools',entry:'packages/awesome-printer-tools/html.mjs',capability:'Safe reproducible HTML and PDF report exports',outstanding:'PDF platform availability and full UI integration'},
 {id:'awesome-gflow-mcp',entry:'packages/awesome-gflow-mcp/src/mcp.mjs',capability:'Offline Master Prompt video compiler and first-party Vertex Veo REST client; Cloud tool execution disabled by default',outstanding:'Production OIDC/PDP + explicit user consent, model access, real provider E2E, media identity/reference upload, extension, GUI and multi-node orchestration'}
].map(x=>Object.freeze({...x,status:x.entry?'PARTIAL':'OPEN'})));
