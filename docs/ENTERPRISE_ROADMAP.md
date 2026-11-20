# Locally Uncensored Enterprise — rejestr wymagań

Data: 2026-11-20. Integracja addytywna w `locally-uncensored-enterprise/`, bez usunięcia desktop/mobile upstream i bez zmiany polityki AGPL. Obowiązuje główna Roadmapa i VALIDATION_POLICY. Fazy zależne od rzeczywiście zweryfikowanych kontraktów; brak zewnętrznego audytu nie usuwa wymagań technicznych.

| ID | Faza / wymaganie | Zależność | Stan |
|---|---|---|---|
| ENT-01 | pnpm monorepo apps/desktop, apps/web, apps/mobile, backend, shared-ui, agent-sdk, CLI i IDE; migracja SPA/Tauri | MIG-003 | PARTIAL: deklaracje workspace i pierwszy realny pakiet agent-sdk; reszta OPEN |
| ENT-02 | Typowany DAG, statyczny kontrakt Agents Builder / Tool Registry, deterministyczna kompilacja | ENT-01 | PARTIAL: kompilator TS 7/7 PASS, limity, cykle, grant i tenant, niemutowalny wynik; rejestr, wykonawca, MCP i UI OPEN |
| ENT-03 | PostgreSQL/pgvector, model danych agentów i RAG per tenant, RLS i parametryzowane zapytania | ENT-01 | PARTIAL: DDL + Compose; brak uruchomienia DB, testów cross-tenant, pool i indeksu ANN |
| ENT-04 | Redis i BullMQ FlowProducer, idempotencja, limity i backpressure | ENT-01 | PARTIAL: definicja Redis; worker/kolejki i integracja OPEN |
| ENT-05 | Keycloak OIDC SSO, walidacja JWT (iss/aud/exp/alg), PKCE, uprawnienia | ENT-01 | OPEN |
| ENT-06 | Permit.io PDP/RBAC/ABAC i deny-by-default; werdykty per tenant | ENT-05 | OPEN |
| ENT-07 | AIM: krótkotrwała tożsamość agentów, scope, revocation, audyt | ENT-05, ENT-06 | OPEN |
| ENT-08 | Temporal durable execution, workflow/activity, fencing/replay/recovery | ENT-02, ENT-04, ENT-07 | OPEN |
| ENT-09 | Orkiestrator wieloagentowy, supervisor/planner/executor/verifier, HITL i anulowanie | ENT-08 | OPEN |
| ENT-10 | MCP Tool Gateway i routing Tavily/Exa/SearXNG, jawna polityka egress, retencji i klasyfikacja danych | ENT-06, ENT-07 | OPEN |
| ENT-11 | Firecracker CPU i gVisor dla obsługiwanych środowisk; GPU tylko po dowodzie kompatybilności/izolacji | ENT-06, ENT-07 | OPEN |
| ENT-12 | Hardware-aware onboarding, GGUF, dual-model, budżety KV/VRAM, ComfyUI | V4-GPU, ENT-09 | OPEN |
| ENT-13 | Agent-Native IDE: React Flow, wizualny DAG, AST/LSP i bezpieczne narzędzia, symulator urządzeń | ENT-02, V4-AST, ENT-11 | OPEN |
| ENT-14 | CLI, SDK/API i współdzielony UI PL/EN, klienci desktop/PWA/mobile | ENT-01, ENT-05, ENT-08 | OPEN |
| ENT-15 | Kompresja kontekstu z zachowaniem źródeł, wersjonowanie embeddingów, RAG i benchmark | ENT-03, ENT-09 | OPEN |
| ENT-16 | Disaster recovery, backup/restore, migracje, telemetria i test awarii | ENT-03, ENT-04, ENT-08 | OPEN |
| ENT-17 | Multi-platform build, lockfile, SBOM, podpisy, release i testy E2E; bez automatycznego uruchamiania płatnego CI | ENT-11, ENT-13, ENT-14, ENT-16 | OPEN |

## Przyjęte bezpieczne decyzje architektoniczne

- Brak sekretów hardcoded i domyślnego tenanta. Sesje oraz tokeny: krótkotrwałe, sprawdzane przez backend; MemoryStore nie jest magazynem produkcyjnym. Nie otwierać listenera przed gotowością zależności.
- PostgreSQL: RLS wymuszone na tabelach agentów i chunków; rola grupowa NOLOGIN/NOBYPASSRLS, a uwierzytelniona rola runtime ma otrzymywać tenant przez SET LOCAL w zweryfikowanej transakcji. RLS oparty na GUC nie zabezpiecza dowolnego SQL wykonywanego jako ta rola — publiczne SQL niedozwolone. Wymiar 768 to jawny początkowy kontrakt, nie uniwersalny wymiar embeddingów. Wyszukiwanie musi uwzględniać tenant i identyfikator modelu.
- Compose nie publikuje portów baz. Obrazy, plik hasła, uwierzytelniony Redis config i polityki operatora obowiązkowe; na etapie deploymentu walidacja digestów, praw dostępu i uwierzytelnienia. Migracja jest jednorazową inicjalizacją świeżej bazy, nie automatycznym upgrade istniejącego wolumenu.
- Self-hosted SearXNG nie gwarantuje samodzielnie zero data retention upstream. Routing musi uwzględniać przekazanie danych i rejestrację zapytań. Kod przesłany z przykładowymi stałymi sekretami, nadmiernym default tenant i pozorowanymi testami nie jest kopiowany do produkcji.
- Nie wdrożono usług zewnętrznych, nie pobierano sekretów i nie uruchamiano płatnych runnerów.

## Następne niezależne wymagania

V4-MODELS, V4-RELEASE (wykonalne części), ENT-05/06/07 oraz ENT-03/04 — w kolejności pozwalającej na weryfikację rzeczywistej izolacji. Żaden otwarty punkt nie jest zaliczony samą dokumentacją.
