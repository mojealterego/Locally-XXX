# Locally Uncensored Enterprise — rejestr wymagań

Data: 2026-11-20. Integracja addytywna w `locally-uncensored-enterprise/`, bez usunięcia desktop/mobile upstream i bez zmiany polityki AGPL. Obowiązuje główna Roadmapa i VALIDATION_POLICY. Fazy zależne od rzeczywiście zweryfikowanych kontraktów; brak zewnętrznego audytu nie usuwa wymagań technicznych.

| ID | Faza / wymaganie | Zależność | Stan |
|---|---|---|---|
| ENT-01 | pnpm monorepo apps/desktop, apps/web, apps/mobile, backend, shared-ui, agent-sdk, CLI i IDE; migracja SPA/Tauri | MIG-003 | PARTIAL: deklaracje workspace i pierwszy realny pakiet agent-sdk; reszta OPEN |
| ENT-02 | Typowany DAG, statyczny kontrakt Agents Builder / Tool Registry, deterministyczna kompilacja | ENT-01 | PARTIAL: kompilator TS 7/7 PASS, limity, cykle, grant i tenant, niemutowalny wynik; rejestr, wykonawca, MCP i UI OPEN |
| ENT-03 | PostgreSQL/pgvector, model danych agentów i RAG per tenant, RLS i parametryzowane zapytania | ENT-01 | PARTIAL: repozytorium pg, transakcje SET LOCAL ROLE/tenant, RAG cosine distance, immutable IDs, review_tasks z RLS i triggerem przejść; kontrakty lokalne PASS. Brak wykonania SQL w realnym PostgreSQL/pgvector, ANN, replikacja i pełny rejestr OPEN |
| ENT-04 | Redis i BullMQ FlowProducer, idempotencja, limity i backpressure | ENT-01 | PARTIAL: rzeczywisty kod FlowProducer i dwóch Worker, tenant-scoped job IDs, dwa child checks, join, re-check PDP, retry/backoff i limity concurrency; testy kontraktów PASS, Redis/BullMQ runtime, wyścigi dispatch i quota per tenant OPEN |
| ENT-05 | Keycloak OIDC SSO, walidacja JWT (iss/aud/exp/alg), PKCE, uprawnienia | ENT-01 | PARTIAL: weryfikator rzeczywistych podpisów RS256/JWKS, issuer/audience/azp/typ/exp/iat/nbf i chroniony claim tenant; testy lokalne PASS. Realm, login PKCE w UI i live IdP otwarte |
| ENT-06 | Permit.io PDP/RBAC/ABAC i deny-by-default; werdykty per tenant | ENT-05 | PARTIAL: realny klient HTTP POST /allowed i fail-closed, kontrola tenant/agent/action, limit czasu, bez przekierowań; testy HTTP PASS. Rzeczywisty PDP, provisioning ról i enforcement w wykonawcach otwarte |
| ENT-07 | AIM: krótkotrwała tożsamość agentów, scope, revocation, audyt | ENT-05, ENT-06 | PARTIAL: 256-bitowe opaque tokeny, SHA-256 w SQLite, TTL max 900 s i nie dłużej niż token operatora, re-check PDP, revocation i audyt transakcyjny, API; 12/12 testów wspólnej warstwy PASS. Klastrowanie PostgreSQL, integracja gateway/worker i retencja audytu otwarte |
| ENT-08 | Temporal durable execution, workflow/activity, fencing/replay/recovery | ENT-02, ENT-04, ENT-07 | PARTIAL: worker + workflow przeglądu strukturalnego projektu, Activities, API HTTP 202, stabilny workflowId, SQL compare-and-set akceptacji i ograniczone oczekiwanie; modelowane kontrakty PASS, prawdziwy Temporal replay/recovery, outbox, HITL signal oraz LLM/sandbox i publikacja agenta OPEN |
| ENT-09 | Orkiestrator wieloagentowy, supervisor/planner/executor/verifier, HITL i anulowanie | ENT-08 | PARTIAL: wykonawca DAG z walidacją topologii, limitem czasu i wyniku, zaufany rejestr handlerów oraz bramka AIM + osobna decyzja tool policy; testy lokalne PASS. Trwały runtime, planner/supervisor, równoległość, faktyczna autoryzacja per tool i HITL OPEN |
| ENT-10 | MCP Tool Gateway i routing Tavily/Exa/SearXNG, jawna polityka egress, retencji i klasyfikacja danych | ENT-06, ENT-07 | PARTIAL: adaptery HTTP i router publicznych kwerend, fail-closed, bez fallbacku i redirectów, limity odpowiedzi, klasyfikator zaufanego hosta; testy kontraktowe PASS. MCP transport, realne API, infrastruktura egress/DLP, Serper i livecrawl OPEN |
| ENT-11 | Firecracker CPU i gVisor dla obsługiwanych środowisk; GPU tylko po dowodzie kompatybilności/izolacji | ENT-06, ENT-07 | PARTIAL: gVisor adapter Docker/runsc z przypiętym obrazem, limity i brak host mounts/network, stdin, kontrola exit code oraz cleanup; testy modelowane PASS. Firecracker, rzeczywisty runsc, izolacja hosta, GPU i recovery po awarii OPEN |
| ENT-12 | Hardware-aware onboarding, GGUF, dual-model, budżety KV/VRAM, ComfyUI | V4-GPU, ENT-09 | PARTIAL: lokalny ResourceArbiter, atomowa rezerwacja dwóch modeli, best-fit, thermal/freshness gate i dokładny wzór KV dla pełnych elementów; 5/5 testów. Fizyczny GPU, discovery, loading/offload, distributed leases OPEN |
| ENT-13 | Agent-Native IDE: React Flow, wizualny DAG, AST/LSP i bezpieczne narzędzia, symulator urządzeń | ENT-02, V4-AST, ENT-11 | PARTIAL: workspace in-memory, CAS i limity, edycja/import/eksport, statyczny izolowany HTML preview z 4 viewportami, rzeczywisty TS AST inspector CLI; kontrakty/testy lokalne PASS. React Flow, LSP, agent edits, sandbox build, trwałość i browser E2E OPEN |
| ENT-14 | CLI, SDK/API i współdzielony UI PL/EN, klienci desktop/PWA/mobile | ENT-01, ENT-05, ENT-08 | PARTIAL: typowany ReviewClient, CLI get/submit/decide/inspect, shared catalog, web build/proxy i workspace manifests; rzeczywiste lokalne HTTP i TS strict PASS. PKCE, React 19, MCP SDK, rzeczywisty backend, native/PWA i lockfile OPEN |
| ENT-15 | Kompresja kontekstu z zachowaniem źródeł, wersjonowanie embeddingów, RAG i benchmark | ENT-03, ENT-09 | PARTIAL: gradientowy scheduler, zachowanie system/recent/pinned, re-count całego promptu przez przekazany adapter, archiwum oryginałów i SHA-256; 5/5 testów z modelowanym licznikiem. Realny tokenizer/LLM, zapis RAG i ocena jakości OPEN |
| ENT-16 | Disaster recovery, backup/restore, migracje, telemetria i test awarii | ENT-03, ENT-04, ENT-08 | PARTIAL: SQLite checkpoint AES-256-GCM, AAD tenant/project/revision, CAS, transakcje FULL, rzeczywisty SIGKILL po commicie i restore; 5/5 testów. Replikacja PG/S3, harmonogram, klucze OS/KMS, retencja i RPO/RTO OPEN |
| ENT-17 | Multi-platform build, lockfile, SBOM, podpisy, release i testy E2E; bez automatycznego uruchamiania płatnego CI | ENT-11, ENT-13, ENT-14, ENT-16 | OPEN |

## Przyjęte bezpieczne decyzje architektoniczne

- Brak sekretów hardcoded i domyślnego tenanta. Sesje oraz tokeny: krótkotrwałe, sprawdzane przez backend; MemoryStore nie jest magazynem produkcyjnym. Nie otwierać listenera przed gotowością zależności.
- PostgreSQL: RLS wymuszone na tabelach agentów i chunków; rola grupowa NOLOGIN/NOBYPASSRLS, a uwierzytelniona rola runtime ma otrzymywać tenant przez SET LOCAL w zweryfikowanej transakcji. RLS oparty na GUC nie zabezpiecza dowolnego SQL wykonywanego jako ta rola — publiczne SQL niedozwolone. Wymiar 768 to jawny początkowy kontrakt, nie uniwersalny wymiar embeddingów. Wyszukiwanie musi uwzględniać tenant i identyfikator modelu.
- Compose nie publikuje portów baz. Obrazy, plik hasła, uwierzytelniony Redis config i polityki operatora obowiązkowe; na etapie deploymentu walidacja digestów, praw dostępu i uwierzytelnienia. Migracja jest jednorazową inicjalizacją świeżej bazy, nie automatycznym upgrade istniejącego wolumenu.
- Self-hosted SearXNG nie gwarantuje samodzielnie zero data retention upstream. Routing musi uwzględniać przekazanie danych i rejestrację zapytań. Kod przesłany z przykładowymi stałymi sekretami, nadmiernym default tenant i pozorowanymi testami nie jest kopiowany do produkcji.
- Nie wdrożono usług zewnętrznych, nie pobierano sekretów i nie uruchamiano płatnych runnerów.

## Następne niezależne wymagania

V4-MODELS i V4-RELEASE (wykonalne części) pozostają otwarte. Następna trójka Enterprise: ENT-21 (LLM Training Studio), ENT-22 (autoryzowany operator koparek), ENT-23 (Virtual Number). Otwarte kryteria ENT-19/20/30 wymagają kontynuacji. Utrzymać otwarte kryteria ENT-13/14/18. Kontynuować otwarte bramki ENT-12/15/16. Kontynuować niezależnie otwarte kryteria ENT-09/10/11. Kontynuacja otwartych kryteriów ENT-03/04/08 niezależnie od przyrostów. Kryteria bezpieczeństwa ENT-05/06/07 muszą zostać zintegrowane z operacjami zamiast pozostawać samodzielnym endpointem. Żaden otwarty punkt nie jest zaliczony samą dokumentacją.

## Integrated App i ODYN Ω — rozszerzenie zakresu 2026-11-20

Jedna aplikacja z wewnętrznym launcherem kafelkowym (nie osobne APK dla każdej funkcji); tryb lokalny offline nie wymaga centralnego SSO. [Specyfikacja modułów i kontraktów](INTEGRATED_APP_SPEC.md) oraz [dowody ENT-05/06/07](OMEGA_ENT_AUTH_EVIDENCE.md).

| ID | Wymaganie | Zależności | Stan |
|---|---|---|---|
| ENT-18 | Integrated App shell: kafelki, nawigacja, rejestr modułów, dostępność, wspólna tożsamość i ustawienia | ENT-01, ENT-14 | PARTIAL: pierwszy web shell PL/EN, 22 kafelki, 8 dostępnych interfejsów (IDE, agent reviews, settings, App Builder, konwerter, JSON, baza wiedzy, stawki), 14 jawnie niedostępnych; build i HTTP PASS. Browser E2E zablokowane polityką środowiska, runtime health, natywne osadzenie, pełne SSO i moduły OPEN |
| ENT-19 | Wbudowany agent Android, Rust/UniFFI, prywatny stan, OCAF OMAs/OMAt | ENT-07, ENT-18 | PARTIAL: panel w istniejącym Tauri MainActivity, jednorazowa zgoda na wyłącznie device_status (RAM, thermal, battery, admission), test Kotlin/JVM PASS i installer overlay rozszerzony. Android SDK build, rzeczywiste UI, Rust/UniFFI/Zenoh, ADB i operacje uprzywilejowane OPEN |
| ENT-20 | Codespace: repozytoria, terminal, bezpieczny zdalny IDE i Actions | ENT-11, ENT-13, ENT-18 | PARTIAL: lokalny przypięty Git SHA, odczyt tylko plików UTF-8 z kontrolą OID, bez symlinków i command execution, CLI list/read/bundle, import w IDE po walidacji SHA-256; 6/6 testów PASS. Zdalny GitHub Codespaces, push, środowisko wykonawcze, Actions i repo write OPEN |
| ENT-21 | LLM Training Studio: import/wersjonowanie danych i wag, LoRA/QLoRA, SFT, ewaluacja modeli lokalnych, trening i eksport GGUF z kontrolą zasobów i pochodzenia danych | ENT-12, ENT-18, V4-MODELS | PARTIAL: walidacja i deterministyczny podział JSONL (train/eval), deduplikacja, źródła/licencje deklarowane przez operatora, SHA-256, niezmienny zapis, CLI oraz offline PEFT SFT/LoRA/QLoRA runner z jawnym --execute. Testy lokalne PASS; lokalne GUI/API przygotowania i eksportu train/eval/manifest podłączone, TRWEB-01..04 PASS; rzeczywisty trening, pełny browser E2E, benchmark jakości, licencje potwierdzone, GPU, mobile i GGUF export OPEN |
| ENT-22 | Operator koparek kryptowalut: telemetria, autoryzowane sterowanie własnymi urządzeniami, limity mocy, audyt, potwierdzenie zmian ustawień | ENT-06, ENT-07, ENT-18 | PARTIAL: klient HTTPS dla operator-owned mining gateway, status i moc/hashrate, prepare/confirm do pause/resume/set_power, zakres watów, tenant-scoped authorize callback, timeout, brak automatycznych retry; realny lokalny HTTP test PASS. Rzeczywisty sprzęt, producent adapter, OIDC/PDP wiring, trwała idempotencja i audyt OPEN |
| ENT-23 | Virtual Number: provider API, zakup/numer własny po zgodzie, połączenia/SMS, uprawnienia, limity i rozliczenia; bez omijania weryfikacji lub nadużyć | ENT-06, ENT-07, ENT-18 | PARTIAL: adapter Twilio REST API do listy własnych numerów i wyszukiwania dostępnych, przygotowanie SMS z weryfikowanym senderem i odbiorcą, powtórne potwierdzenie, limit lokalny, timeout, brak redirectów; testy kontraktu PASS. Żadne SMS/zakup nie zostały wykonane. Fizyczne połączenia, zakup, fakturowanie, compliance, trwałe limity, OIDC/PDP i UI OPEN |
| ENT-24 | ODYN/OCAF: natywni agenci Rust+Zenoh, OMAs/OMAt/OSTc, rejestr, cykl życia i certyfikaty | ENT-02, ENT-07, ENT-08 | OPEN |
| ENT-25 | DGM/RSI i Agent Academy: ograniczone eksperymenty, baseline, rollback, zakaz samodzielnej zmiany uprawnień, budżety | ENT-11, ENT-24 | OPEN |
| ENT-26 | ODYN research: codzienna inżynieria, cotygodniowe badanie rynku, comiesięczna propozycja ewolucji, zatwierdzanie operatora | ENT-08, ENT-24, ENT-25 | OPEN |
| ENT-27 | Agents Market: dokumentacja, ceny/licencje, certyfikaty wewnętrzne, płatności i autoryzowana dystrybucja, podpisy oraz szyfrowanie/hybrydowa PQC | ENT-07, ENT-24 | OPEN |
| ENT-28 | Global Registry i Approval UI: autoryzowane odczyty, walidacja danych i sygnały Temporal związane z konkretną wersją artefaktu | ENT-03, ENT-05, ENT-08, ENT-24 | OPEN |
| ENT-29 | Observability: tenant-scoped zdarzenia, trwały audyt, redakcja sekretów, streaming z uprawnieniami, OpenTelemetry | ENT-03, ENT-07, ENT-09 | PARTIAL: lokalny HMAC SQLite ledger i HTTP/SSE OIDC/PDP, instrumentacja DAG/Agent Runtime, 13/13 testów. Brak OpenTelemetry, centralnego HA/retencji, UI i globalnych E2E |
| ENT-30 | Multi-target App Builder, React Flow, AST i kompilacja platformowa | ENT-13, ENT-17, ENT-18 | PARTIAL: deklaratywne ekrany i przyciski nawigacji, walidacja grafu, kompilator AST TypeScript Compiler API do React source + SHA-256, CLI i formularz DOM z podglądem oraz eksportem JSON; 5/5 testów PASS. React Flow, typecheck realnego React, E2E, pakowanie Android/iOS/desktop/web OPEN |

## Aktualizacja architektury Enterprise — IDE, RAG, inference i operacje

[ENTERPRISE_ARCHITECTURE_INCREMENT.md](ENTERPRISE_ARCHITECTURE_INCREMENT.md) uszczegóławia ENT-09/10/11/13/15/16/17/28/29/30, bez usuwania wcześniejszych wymagań. ENT-03/04/08: [dowody](OMEGA_ENT_EXECUTION_EVIDENCE.md) — 16 nowych testów + 12 regresji PASS, SDK i klaster NOT_RUN. `APPROVED` w module review oznacza zaakceptowany strukturalny projekt, nie certyfikację ani wdrożenie agenta.

## Ustawienia, optymalizacja i Model Manager — 2026-11-20

[SETTINGS_OPTIMIZATION_SPEC.md](SETTINGS_OPTIMIZATION_SPEC.md) uszczegóławia V4-GPU/V4-THERMAL/V4-MODELS oraz ENT-10/11/12/14/15/18/21. Parametry i wartości z raportu operatora są hipotezami/punktami startowymi, nie dowodami benchmarków.

| ID | Wymaganie | Zależności | Stan |
|---|---|---|---|
| ENT-31 | Integrated Settings: provider registry, porty i ścieżki, GGUF/bundles, onboarding, memory/voice, tryby uprawnień i profile sprzętowo-generatywne oraz diagnostyka | ENT-12, ENT-14, ENT-18, V4-MODELS | OPEN |
| ENT-32 | ComfyUI schema-aware workflow, image/video presets, walidacja model+VAE+encoder, reprodukowalność, OOM recovery i pomiar zasobów | ENT-12, ENT-31 | OPEN |

ENT-09/10/11: [dowody lokalne](OMEGA_ENT_TOOL_RUNTIME_EVIDENCE.md) — 17/17 testów PASS w wyizolowanym zestawie, bez usług zewnętrznych. Brak globalnego odbioru.

## Enterprise Media / Remote Access / Compliance — rozszerzenie 2026-11-20

| ID | Wymaganie | Zależności | Stan |
|---|---|---|---|
| ENT-33 | Rozproszona farma ComfyUI: discovery GPU, capability/lease, kolejki renderu, artefakty, retry/anulowanie, opcjonalny Run:ai adapter | ENT-04, ENT-12, ENT-32 | OPEN |
| ENT-34 | WebRTC Voice AI: self-hosted STT/TTS, duplex/barge-in, autoryzowany signaling i TURN, jawna polityka retencji | ENT-05, ENT-12, V4-VOICE | OPEN |
| ENT-35 | ZTNA remote access: OIDC/PKCE, tożsamość urządzenia, krótkotrwałe sesje, per-resource authorization, revocation i audyt | ENT-05, ENT-06, ENT-07, ENT-19 | OPEN |
| ENT-36 | AGPL compliance i separacja niezależnych usług: SBOM/licencje, oferta Corresponding Source, granice integracji i analiza konkretnych zależności | ENT-10, ENT-17, ENT-24 | OPEN |

[ENTERPRISE_MEDIA_REMOTE_SPEC.md](ENTERPRISE_MEDIA_REMOTE_SPEC.md) doprecyzowuje także ENT-24/28/29 (rejestr, bezpośredni chat, SSE, action bar), nie dublując wcześniejszych wymagań. [Dowody ENT-12/15/16](OMEGA_ENT_RESOURCE_EVIDENCE.md): 15 nowych testów + 17 regresji PASS, bez fizycznego GPU lub klastra.

ENT-13/14/18: [dowody pierwszego web shell](OMEGA_ENT_UI_EVIDENCE.md) — 9 lokalnych testów PASS, TS strict PASS, browser E2E BLOCKED. Aktualnie trzy interfejsy są dostępne, nie oznacza to potwierdzonej gotowości usług za nimi.

## Przyrost ENT-19/20/30
[Dowody](OMEGA_ENT_MOBILE_CODESPACE_BUILDER_EVIDENCE.md): 11/11 testów Node PASS, Kotlin/JVM policy PASS; Android SDK, Rust/UniFFI, real browser E2E NOT_RUN. Statusy pozostają PARTIAL.

## Przyrost ENT-21/22/23 — 2026-11-21
[Dowody testów i kontrakty](OMEGA_ENT_TRAINING_MINING_TELECOM_EVIDENCE.md). 13/13 testów lokalnych PASS w izolowanym zakresie, syntaktyka Node i Python PASS. Brak uruchomionego HF training (TRL/PEFT nieobecne), żadnego prawdziwego mining endpoint, numeru Twilio, telefonu ani transakcji. Status PARTIAL; globalne GATE-09 OPEN.

## Integracje PurpleDoubleD — nowy zakres 2026-11-21

| ID | Wymaganie | Zależności | Stan |
|---|---|---|---|
| ENT-37 | Prywatny konwerter JPG/PNG/WebP, docelowo PDF/HEIC/SVG, intake do RAG | ENT-18, ENT-10 | PARTIAL: browser Canvas JPG/PNG/WebP, magic bytes, limit 25 MiB i 24 MP. PDF/HEIC/SVG i browser E2E OPEN |
| ENT-38 | JSON toolkit z CLI i walidacją IDE | ENT-13, ENT-18 | PARTIAL: JSON pretty/minify/YAML/ENV, limit 1 MiB, testy. Automatyczny AST hook i browser E2E OPEN |
| ENT-39 | Pinned offline knowledge awesome-local-llm oraz RAG pgvector | ENT-15, ENT-18 | PARTIAL: README+LICENSE MIT z SHA upstream, wyszukiwanie słów, deterministyczne fragmenty z cytowaniem, adaptacja Ollama /api/embed (768) i transakcja pgvector. Rzeczywisty embedding i DB E2E OPEN |
| ENT-40 | Kalkulator stawek i serwer MCP dla Agenta Biznesowego | ENT-14, ENT-18 | PARTIAL: lokalny kalkulator i MCP stdio 2025-11-25 (tools/list, tools/call), test subprocess. Integracja OMAt, fiskalna i zewnętrzne systemy OPEN |

[Dowody, licencje i ograniczenia](OMEGA_ENT_EXTERNAL_INTEGRATIONS.md). 16/16 lokalnych testów PASS. GATE-09 wszystkich czterech punktów OPEN.

## ENT-41–43 — lokalne katalogi, geometria viewportu i kontrola budżetu

| ID | Wymaganie | Zależności | Status |
|---|---|---|---|
| ENT-41 | Wspólny indeks katalogów inspirowany discogs-viewer: wyszukiwanie, filtry, sortowanie i paginacja w Model Manager, Agent Registry oraz launcherze | ENT-18, ENT-28, ENT-31 | PARTIAL: typed/validated data snapshot (50k rows max), lokalny AND search z polskimi diakrytykami, kategorie/tagi/lata, deterministyczne sortowanie, paginacja; interfejs live w launcherze. Dedykowane widoki Agent Registry i Model Manager, browser E2E i wydajność 50k na telefonie OPEN |
| ENT-42 | Poprawna geometria wbudowanego symulatora urządzeń i adaptacyjnego iframe | ENT-13, ENT-30 | PARTIAL: obliczenia viewportLayout i zintegrowany resize w IDE; bez nadmiernego zoomu, dopasowanie szerokości i wysokości. Rzeczywisty browser i Android/iOS simulators OPEN |
| ENT-43 | Gradientowy przydział tokenów dla historycznych segmentów z gwarantowanym budżetem i ochroną współczesnego horyzontu | ENT-15, ENT-31 | PARTIAL: deterministyczny largest-remainder integer apportionment, wagi exp(-decay*age) ograniczone do [0.1,1], wspólny budżet, chronione system/recent/pinned, rzeczywiste liczenie przez dostarczony tokenizer callback. Testy jednostkowe i regresyjne PASS; ewaluacja semantyczna, produkcyjny tokenizer/model/VRAM E2E OPEN |

[Dowody i ograniczenia](OMEGA_ENT_CATALOG_VIEWPORT_CONTEXT_EVIDENCE.md). Nowe testy: 12/12 PASS; ponownie wykonane wybrane historyczne testy CTX-01..05: 5/5 PASS. Brak zewnętrznych zależności, żadnego kosztownego CI. GATE-09 OPEN.

## Cloud Multi-Provider Gateway — ENT-44/45/46 (2026-11-21)

| ID | Wymaganie | Zależność | Stan |
|---|---|---|---|
| ENT-44 | Hybrydowy wybór modeli: OpenAI, Anthropic, OpenRouter, Groq, Together, DeepSeek, Mistral; brak automatycznego egress, klasyfikacja i potwierdzenie promptu | ENT-05, ENT-06, ENT-18 | PARTIAL: stała allowlista HTTPS, tylko publiczne dane i jawna aktywacja, limit rozmiaru i heurystyka sekretów, requesty dopuszczane po zgodzie. Live dostawcy, DLP formalne, faktury i modele OPEN |
| ENT-45 | Szyfrowany, odseparowany od przeglądarki magazyn kluczy na tenant, cofanie, konfiguracja prywatna, rotacja i kontrola operatora | ENT-07, ENT-16 | PARTIAL: rzeczywisty SQLite AES-256-GCM z zewnętrznym 32B kluczem plikowym, katalog 0700 / plik 0600, API write/forget/status, kontrola tenant. KMS/OS keystore, rotacja, backup, HA, pełny audit OPEN |
| ENT-46 | Uwierzytelniony cloud proxy, SSE i UI chmury w Integrated App, jawne zgody, bez ujawniania rozumowania ukrytego | ENT-44, ENT-45, ENT-18 | PARTIAL: HTTP OIDC/Permit + jednokrotne ticket approval 60s, backend Stream SSE dla standardowych adapterów, lokalny same-origin web proxy + kafelek Cloud Gateway; 19 testów lokalnych PASS. Browser E2E, Rust Tauri proxy, live IdP/PDP, provider API E2E i rozliczenia OPEN |

[Instrukcja bezpiecznego uruchomienia](../locally-uncensored-enterprise/backend/CLOUD_GATEWAY.md) · [dowody CLD-01..19](OMEGA_ENT_CLOUD_GATEWAY_EVIDENCE.md). Domyślnie `OMEGA_CLOUD_ENABLED` nie jest aktywne. Żaden klucz użytkownika nie został dodany do kodu. Brak automatycznych zapytań do zewnętrznych modeli. 

**GATE-09: OPEN** dla ENT-44/45/46. Żaden status PARTIAL nie oznacza pełnej migracji do Enterprise, prywatności w chmurze ani produkcyjnego wdrożenia.

## Awesome Enterprise Workspace — ENT-47/48/49 (2026-11-21)

Dziesięć nazw `awesome-*` stanowi logiczną mapę rzeczywistego kodu, nie kopie istniejących implementacji. Brakujące moduły są jawnie OPEN. Wstępne statusy nie nadają certyfikatów wdrożenia.

| ID | Wymaganie | Zależności | Status |
|---|---|---|---|
| ENT-47 | Awesome registry: manifest 10 modułów, kontrola obecności plików, uczciwa widoczność statusów, launcher i CLI | ENT-18, ENT-13, ENT-14 | PARTIAL: read-only status catalog/CLI, source verification bez symlinków, kafelek Awesome Enterprise i delegacja do istniejących UI. Native Tauri/awesome-opensource-app OPEN, GUI browser E2E OPEN |
| ENT-48 | Awesome Open Source Alternatives: realny, audytowalny benchmark lokalnego Ollama i porównanie obserwacji | ENT-12, ENT-31, ENT-44 | PARTIAL: rzeczywisty adapter HTTP na loopback z NDJSON, walidacja czasów/tokenów, pomiar TTFT i tokens/s, SHA promptu, wymóg jawnego `--execute YES`, CLI i porównanie warunków. Fixture HTTP PASS; realny model, chmura/ceny, sprzętowe pomiary, jakościowy scoring OPEN |
| ENT-49 | Awesome Printer Tools: deterministyczne lokalne raporty HTML/PDF i bezpieczna serializacja | ENT-13, ENT-16, ENT-40 | PARTIAL: walidacja struktury, HTML z CSP i escaping, ReportLab 4.4.9 z TTF lokalnego systemu, PDF invariant; dwa PDF byte-identyczne i poprawna ekstrakcja polskich znaków. GUI, podpisy cyfrowe, cross-platform build i rzeczywiste dokumenty audytowe OPEN |

[Instrukcja](../locally-uncensored-enterprise/README_AWESOME.md) · [dowody testowe](OMEGA_ENT_AWESOME_EVIDENCE.md). Lokalne testy: 12/12 PASS. **GATE-09 OPEN** dla ENT-47..49.

## ENT-44/46 — QTA-01..10 (2026-11-21)

Stan PARTIAL: zaimplementowano trwały licznik dzienny tenant-scoped na SQLite, dwa obowiązkowe limity konfiguracji, fail-closed przed strumieniem do dostawcy, odczyt limitów w autoryzowanym statusie i brak zwrotu rezerwacji przy niejednoznacznym wyniku. QTA-01..10: 10/10 lokalnych testów PASS, w tym test rzeczywistego HTTP loopback; full-suite, realny OIDC/PDP i zewnętrzny provider NOT_RUN. Prawdziwe koszty w walucie, input tokens, ceny modeli, faktury i distributed ledger wciąż OPEN. [Dowody](OMEGA_ENT_CLOUD_QUOTA_EVIDENCE.md). GATE-09 OPEN.

## ENT-29 — lokalny dziennik zdarzeń i audyt (2026-11-21)

Moduły `backend/src/observability/ledger.mjs`, `http.mjs`, `start.mjs` oraz integracja z `graph-runner.mjs` i `agent-runtime.mjs` zapisują wyłącznie uporządkowane zdarzenia procesu bez danych promptów, wyników lub prywatnego rozumowania. HMAC-SHA-256 per tenant, transakcje SQLite, OIDC/PDP przed odczytem i SSE z limitami oraz cursorem. Testy AUD-01..13: 13 PASS lokalnie. Dane zdarzeń z pozostałych procesów nie są jeszcze integrowane, nie istnieje pełny GUI panel, brak produkcyjnego OTel, PostgreSQL, retencji i ZTNA. [Dowody](OMEGA_ENT_OBSERVABILITY_EVIDENCE.md). **PARTIAL, GATE-09 OPEN.**

ENT-29 APX-01..04 (2026-11-21): stały, lokalny proxy pass-through `/api/audit/list` i `/api/audit/stream` przez aplikację web, filtr Origin/Bearer i limity. Testy: 4/4 PASS (razem AUD+APX 17/17). Brak UI audytu, zdalnego ZTNA, SSO PKCE, centralnej retencji i pełnych E2E. [Dowody](OMEGA_ENT_OBSERVABILITY_EVIDENCE.md). Status PARTIAL, GATE-09 OPEN.

| ENT-50 | Awesome GFlow MCP / Vertex Veo: Master Prompt JSON, Entity Registry, asynchroniczne wideo, idempotencja, retry/poll, zero-trust egress, zgodny legalnie media pipeline | ENT-07, ENT-10, ENT-12, ENT-33 | PARTIAL: nowy package + parser i kompilator scen, Vertex Veo predictLongRunning/fetchPredictOperation, MCP stdio compile-only, SQLite z tenant-scoped limitami i idempotencją, 21/21 lokalnych testów PASS. Realne Google Cloud i billing, consent OIDC/PDP, identity reference media, clip extend/upscale, AST/GUI/Tauri/mobile OPEN |

### ENT-50 — Sovereign Film Studio / Vertex Veo (2026-11-21)

Integracja oparta wyłącznie na potwierdzonych API Google Cloud; nie wykorzystuje wewnętrznych endpointów Google Labs Flow, reCAPTCHA ani obchodzenia moderacji. Scentralizowany monorepo `packages/awesome-gflow-mcp` dostarcza 3-warstwowy Master Prompt (metadata, entities, scenes) i lokalny MCP z bezpiecznym offline compile; funkcje płatnego renderu pozostają wyłączone w publicznym MCP. Biblioteka backendowa obsługuje rzeczywiste oficjalne REST endpoints po zewnętrznym uwierzytelnieniu OAuth i zaufanej, uprzedniej autoryzacji operatora; testy API były wyłącznie mockowane. Stan operacji jest utrwalony i nie wykonuje niebezpiecznych ponowień po niepewnym submit. Trzeba zintegrować rzeczywiste uprawnienia, ograniczenia kosztu, realny model, jawny wybór wysyłanych mediów, referencje, rozszerzanie i skalowanie filmów, dopiero później E2E/desktop/mobile. [Dowody](OMEGA_ENT_GFLOW_EVIDENCE.md). **PARTIAL; GATE-09 OPEN.**

| ENT-51 | Omega Omniverse Android Foundation: natywny mobilny broker dzierżaw, Android thermal/LMKD admission, CaMeL capability/taint, dystrybucja overlay, docelowo Rust/JNI in-process Dual-GGUF i Zero-Trust 18 filarów | ENT-12, ENT-19, ENT-29, ENT-50 | PARTIAL: zaimplementowano i połączono Kotlin Memory Lease Broker z OmegaThermalMonitor, dwufazowe odzyskiwanie pamięci i świeżą telemetrię, ograniczony politykami OmegaMobileAgent, bezpieczny instalator. 16 deterministycznych nowych testów Kotlin + kontrola regresji starego MobileAgent i modelowany monitor PASS lokalnie. Rust, NDK, JNI, llama.cpp, fizyczny S24, 16 KB APK/ELF, pełna sieć/model/HPC i 18 modułów OPEN |

### ENT-51 — Android Foundation / Omega Omniverse (2026-11-21)

Szczegóły implementacji, SHA źródeł, testów i ograniczeń środowiskowych: [OMEGA_OMNIVERSE_ANDROID_ENT51_EVIDENCE.md](OMEGA_OMNIVERSE_ANDROID_ENT51_EVIDENCE.md). Nie powielono istniejącego backendowego ResourceArbiter; warstwa Kotlin Android kontroluje tylko przyszłe rezerwacje lokalnych silników, a ich faktyczne odładowywanie, JNI i zakup/build APK nadal wymagają integracji. Wartość 6553 MiB jest limitem analitycznym, nie zweryfikowanym budżetem urządzenia. **PARTIAL; GATE-09 OPEN.**

ENT-51 PSZ-01..10 (2026-11-21): dołożono niezależny, fail-closed verifier 16 KiB ELF64/ZIP dla arm64 APK i AAB, rozróżniający ELF verification od końcowego APK packaging verification. Testy na kontrolowanych plikach ZIP/ELF: 10/10 PASS lokalnie; produkcyjny ARM64/NDK, bundletool i urządzenie NIEURUCHOMIONE. [Dowody](OMEGA_OMNIVERSE_ANDROID_ENT51_EVIDENCE.md). Status PARTIAL, GATE-09 OPEN.

| ENT-52 | Android Dual-GGUF lifecycle: rzeczywisty in-process backend JNI z llama.cpp, dwie rezydentne instancje, transakcyjne dzierżawy, kontrola KV/cache, testy na ARM64 i odzyskiwanie po LMKD | ENT-51 | PARTIAL: Kotlin `OmegaNativeModelCoordinator` i `OmegaAndroidModelAdmission`, dwufazowe physical unload → potwierdzona dzierżawa, defensywna inspekcja GGUF z jednym FD, 10/10 testów lokalnego kontrolera; realne JNI/llama.cpp, spec decode, NDK/ARM64, fizyczny Android oraz pełne regresje OPEN |

### ENT-52 — transactional Dual-GGUF lifecycle, 2026-11-21

Zaimplementowano kontroler rezerwacji dwóch modeli wraz z preflight GGUF, dwufazowym zwolnieniem pamięci, konserwatywnym stanem `suspectSlots` po awarii oraz adapterem do `OmegaThermalMonitor`. Testy jednostkowe sterowania przeprowadzone na Linux x86-64 (Kotlin/JVM): NMC-01..10 PASS. **Nie wykonano rzeczywistego ładowania w `llama.cpp` ani budowy APK**. [Dowody](OMEGA_ENT52_DUAL_GGUF_LIFECYCLE_EVIDENCE.md). PARTIAL, GATE-09 OPEN.

| ENT-53 | Android C++20 native in-process dual GGUF: JNI bridge, verified llama source pin, two-slot load/unload RAII, nonblocking production integration, Android Gradle/NDK 16 KiB, real inference and speculative decoding | ENT-51, ENT-52 | PARTIAL: C++20 RAII dual slot + JNI API and Kotlin ParcelFileDescriptor bridge, Android-only pinned CMake, 9/9 native host tests with ASan/UBSan and 8/8 JVM→JNI host smoke with mocked llama, no actual production Android build/real GGUF/decode |

### ENT-53 — native C++20 JNI llama.cpp model loader, 2026-11-21

Pliki w `overlays/android/native` implementują C++ loader przez `llama_model_load_from_file_ptr` z dwoma slotami oraz bezpośredni most JNI, źródło `llama.cpp` przypięte do `418fe97b5f01b11eeb89f30d8a0459433edbf1d2`. W lokalnym teście z kontrolowaną atrapą libllama kompilacja i JNI wywołania PASS (9+8 scenariuszy). **Nie ma pełnego Android build/Gradle/NDK, realnego modelu, generacji tekstu, GPU ani pakowania APK**. [Evidence](OMEGA_ENT53_LLAMA_JNI_EVIDENCE.md). PARTIAL, GATE-09 OPEN.

| ENT-54 | In-process generation llama.cpp, deterministic greedy decode, JNI UTF-8, cancellation, integration opt-in Gradle/NDK Android ARM64 | ENT-51, ENT-52, ENT-53 | PARTIAL: implementacja C++ batch_ext/process, JNI ByteArray, Android installer pin SHA/rollback, 35 scenariuszy C++/JNI z mock llama PASS, 8 testów instalatora PASS, Kotlin typecheck PASS na atrapach; real inference/Android NDK/physical S24/16 KB APK NOT_RUN |

### ENT-54 — Kotlin/JNI Android inference and packaging bridge (2026-11-21)

Dołożono sterowanie sekwencją tokenizacji i dekodowania w rzeczywistym kodzie C++ `OmegaLlamaEngine` oraz bezpośredni transfer UTF-8 przez JNI, bez `llama-server` i bez udawanych odpowiedzi w kodzie produkcyjnym. Testy użyły jawnie oznaczonego mocka `llama.cpp`, więc nie dowodzą prawdziwej inferencji. Instalator `scripts/install_android_llama.py` bezpiecznie przygotowuje projekt generowany przez Tauri i odmawia ingerencji w nieznane pliki/kopii bez przypięcia upstream. [Dowody](OMEGA_ENT54_GENERATION_AND_ANDROID_INSTALL_EVIDENCE.md). **PARTIAL; GATE-09 OPEN.**
