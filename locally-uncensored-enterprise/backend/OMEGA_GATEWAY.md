# OMEGA Gateway (local operator adapter)
Use omegaLocalStream(messages, token) from src/cloud/omega-local.mjs in a
trusted single-operator backend process. Set the token from a private secret
store. It sends only to localhost and never chooses a cloud model. Reuses the
existing SSE parser and demands a terminal [DONE]. Not connected to the
multi-tenant cloud route, renderer or worker. Do not expose the token or add a
route without the existing OIDC/PDP tenant controls. Run
node --test test/omega-local.test.mjs from backend. Source tests unexecuted.
Gateway source: https://github.com/mojealterego/ocaf-runtime/tree/main/integrations/omega-openai-gateway
