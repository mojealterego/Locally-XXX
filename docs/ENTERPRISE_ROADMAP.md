# Locally Uncensored Enterprise — rejestr wymagań

Data: 2026-11-20. Integracja addytywna w `locally-uncensored-enterprise/`, bez usunięcia desktop/mobile upstream i bez zmiany polityki AGPL. Obowiązuje główna Roadmapa i VALIDATION_POLICY. Fazy zależne od rzeczywiście zweryfikowanych kontraktów; brak zewnętrznego audytu nie usuwa wymagań technicznych.

| ID | Faza / wymaganie | Zależność | Stan |
|---|---|---|---|
| ENT-01 | pnpm monorepo apps/desktop, apps/web, apps/mobile, backend, shared-ui, agent-sdk, CLI i IDE; migracja SPA/Tauri | MIG-003 | PARTIAL: deklaracje workspace i pierwszy realny pakiet agent-sdk; reszta OPEN |
| ENT-02 | Typowany DAG, statyczny kontrakt Agents Builder / Tool Registry, deterministyczna kompilacja | ENT-01 | PARTIAL: kompilator TS 7/7 PASS, limity, cykle, grant i tenant, niemutowalny wynik; rejestr, wykonawca, MCP i UI OPEN |
| ENT-03 | PostgreSQL/pgvector, model danych agentów i RAG per tenant, RLS i parametryzowane zapytania | ENT-01 | PARTIAL: DDL + Compose; brak uruchomienia DB, testów cross-tenant, pool i indeksu ANN |
| ENT-04 | Redis i BullMQ FlowProducer, idempotencja, limity i backpressure | ENT-01 | PARTIAL: definicja Redis; worker/kolejki i integracja OPEN |
| ENT-05 | Keycloak OIDC SSO, walidacja JWT (iss/aud/exp/alg), PKCE, uprawnienia | ENT-01 | PARTIAL: weryfikator rzeczywistych podpisów RS256/JWKS, issuer/audience/azp/typ/exp/iat/nbf i chroniony claim tenant; testy lokalne PASS. Realm, login PKCE w UI i live IdP otwarte |
| ENT-06 | Permit.io PDP/RBAC/ABAC i deny-by-default; werdykty per tenant | ENT-05 | PARTIAL: realny klient HTTP POST /allowed i fail-closed, kontrola tenant/agent/action, limit czasu, bez przekierowań; testy HTTP PASS. Rzeczywisty PDP, provisioning ról i enforcement w wykonawcach otwarte |
| ENT-07 | AIM: krótkotrwała tożsamość agentów, scope, revocation, audyt | ENT-05, ENT-06 | PARTIAL: 256-bitowe opaque tokeny, SHA-256 w SQLite, TTL max 900 s i nie dłużej niż token operatora, re-check PDP, revocation i audyt transakcyjny, API; 12/12 testów wspólnej warstwy PASS. Klastrowanie PostgreSQL, integracja gateway/worker i retencja audytu otwarte |
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

V4-MODELS i V4-RELEASE (wykonalne części) pozostają otwarte. Następna trójka Enterprise: ENT-03 (repozytorium PostgreSQL), ENT-04 (BullMQ), ENT-08 (Temporal worker i trwałe wykonanie), a następnie ENT-09/10/11. Kryteria bezpieczeństwa ENT-05/06/07 muszą zostać zintegrowane z operacjami zamiast pozostawać samodzielnym endpointem. Żaden otwarty punkt nie jest zaliczony samą dokumentacją.

## Integrated App i ODYN Ω — rozszerzenie zakresu 2026-11-20

Jedna aplikacja z wewnętrznym launcherem kafelkowym (nie osobne APK dla każdej funkcji); tryb lokalny offline nie wymaga centralnego SSO. [Specyfikacja modułów i kontraktów](INTEGRATED_APP_SPEC.md) oraz [dowody ENT-05/06/07](OMEGA_ENT_AUTH_EVIDENCE.md).

| ID | Wymaganie | Zależności | Stan |
|---|---|---|---|
| ENT-18 | Integrated App shell: kafelki, nawigacja, rejestr modułów, dostępność, wspólna tożsamość i ustawienia | ENT-01, ENT-14 | OPEN |
| ENT-19 | Wbudowany agent Android: adapter Rust/UniFFI, uprawnienia Android, prywatny stan, kontrola operatora; OCAF bridge OMAs/OMAt | ENT-07, ENT-18 | OPEN; źródła odczytane: ZeroAI i Android-Agent-; wymagany audyt licencji i ABI |
| ENT-20 | Codespace: własne repozytoria, VS Code/IDE, terminal, bezpieczne zdalne środowisko, Actions z limitami kosztów | ENT-11, ENT-13, ENT-18 | OPEN |
| ENT-21 | LLM Training Studio: import/wersjonowanie danych i wag, LoRA/QLoRA, SFT, ewaluacja modeli lokalnych, trening i eksport GGUF z kontrolą zasobów i pochodzenia danych | ENT-12, ENT-18, V4-MODELS | OPEN |
| ENT-22 | Operator koparek kryptowalut: telemetria, autoryzowane sterowanie własnymi urządzeniami, limity mocy, audyt, potwierdzenie zmian ustawień | ENT-06, ENT-07, ENT-18 | OPEN |
| ENT-23 | Virtual Number: provider API, zakup/numer własny po zgodzie, połączenia/SMS, uprawnienia, limity i rozliczenia; bez omijania weryfikacji lub nadużyć | ENT-06, ENT-07, ENT-18 | OPEN |
| ENT-24 | ODYN/OCAF: natywni agenci Rust+Zenoh, OMAs/OMAt/OSTc, rejestr, cykl życia i certyfikaty | ENT-02, ENT-07, ENT-08 | OPEN |
| ENT-25 | DGM/RSI i Agent Academy: ograniczone eksperymenty, baseline, rollback, zakaz samodzielnej zmiany uprawnień, budżety | ENT-11, ENT-24 | OPEN |
| ENT-26 | ODYN research: codzienna inżynieria, cotygodniowe badanie rynku, comiesięczna propozycja ewolucji, zatwierdzanie operatora | ENT-08, ENT-24, ENT-25 | OPEN |
| ENT-27 | Agents Market: dokumentacja, ceny/licencje, certyfikaty wewnętrzne, płatności i autoryzowana dystrybucja, podpisy oraz szyfrowanie/hybrydowa PQC | ENT-07, ENT-24 | OPEN |
| ENT-28 | Global Registry i Approval UI: autoryzowane odczyty, walidacja danych i sygnały Temporal związane z konkretną wersją artefaktu | ENT-03, ENT-05, ENT-08, ENT-24 | OPEN |
| ENT-29 | Observability: tenant-scoped zdarzenia, trwały audyt, redakcja sekretów, streaming z uprawnieniami, OpenTelemetry | ENT-03, ENT-07, ENT-09 | OPEN |
| ENT-30 | Multi-target App Builder: wizualny graf React Flow, walidacja, generacja AST bez interpolacji kodu, osobne artefakty projektu i web/desktop/mobile/www | ENT-13, ENT-17, ENT-18 | OPEN |
