# OMEGA / Locally-XXX — przyrost implementacyjny 2026-11-25

Repozytorium: `mojealterego/Locally-XXX`, gałąź wyłącznie `main`.
Zakres: integracja dostępu do weryfikowanego źródła runtime oraz pierwsza rzeczywista ścieżka OMEGA Developer Suite (Node.js, local UI, HTTP i MCP). Nie uruchamiano buildów zgodnie z decyzją operatora.

## RUN-001 — etap implementacyjny, nie odbiór builda

- `scripts/runtime-entry.mjs` kieruje działania `verify/dev/build/lint/test:unit/test:e2e/tauri:build` do przypiętego podmodułu lub przygotowanego snapshotu staging.
- Snapshot jest sprawdzany przez istniejące `prepareStage` z kontrolą integralności indeksu i bajtów. W razie istnienia nieprawidłowego, niepustego checkoutu tryb `auto` odrzuca wykonanie zamiast ukrywać naruszenie.
- Operator może wybrać `OMEGA_SOURCE_MODE=auto|submodule|staged`. Brak dwóch dużych zasobów dokumentacyjnych można dopuścić wyłącznie jawnie przez `OMEGA_ALLOW_MISSING_DOC_ASSETS=YES`, bez wyłączania kontroli plików źródłowych.
- Zmiany `package.json` przełączają siedem akcji aplikacji na nowy selektor. **Faktyczny npm, Cargo, Tauri i APK: NOT_RUN**. Nie ma dowodu, że pełne źródła i zależności są kompletne do kompilacji.

## DEV-001–012 — rzeczywisty przyrost

- `scripts/devsuite-core.mjs`: JSON format, Base64 UTF-8 encode/decode, inspekcja JWT bez weryfikacji podpisu, SHA-256/512 (oraz legacy MD5/SHA-1), kryptograficzne hasła, UUIDv4.
- `locally-uncensored-enterprise/apps/web/devsuite-service.mjs`: jawna biała lista 7 operacji, walidacja pól, rozmiarów i parametrów, brak shell/network/dynamic execute.
- `devsuite-http.mjs` + `serve.mjs`: wyłącznie loopback, same-origin, nagłówek niestandardowy, limit 64 KiB, `Cache-Control: no-store`, bez trwałego przechowywania tokenów.
- `devsuite-browser.mjs` + launcher: polsko-angielski ekran narzędzi, wyniki w bezpiecznym `textContent`, możliwość kopiowania.
- `integrations/bin/devsuite-mcp.mjs`: STDIO JSON-RPC 2.0, tools/list, tools/call, initialize/ping, granica 64 KiB/wiersz, brak egress. Zgłoszony protokół `2025-11-25`; zgodność z zewnętrznymi klientami MCP nie została jeszcze potwierdzona testem interoperacyjności.

## Wykonane testy lokalne (bez builda)

Środowisko: Linux x86_64, Node.js 22.16.0; izolowana kopia modułów przygotowana lokalnie. Sekwencja komend:
- `node --test locally-uncensored-enterprise/test/devsuite-service.test.mjs` — 5/5 PASS.
- `node --test locally-uncensored-enterprise/test/devsuite-http.test.mjs` — 3/3 PASS, rzeczywiste HTTP loopback.
- `node --test locally-uncensored-enterprise/integrations/test/devsuite-mcp.test.mjs` — 5/5 PASS, obsługa STDIO w pamięci.
- `node --test tests/runtime-entry.test.mjs` — 5/5 PASS, kontrakty routingu z wstrzykniętym runnerem; **nie** rzeczywisty build.

Łącznie: **18/18 PASS w wymienionych izolowanych testach**. Weryfikacja pełnego checkoutu i globalnej regresji nie była wykonywana. Test `runtime-entry` stosuje adapter kontrolowany, a nie faktyczną materializację staging. Dodatkowe testy `tests/devsuite-core.test.mjs` istnieją w repo, ale nie są ujęte w powyższej liczbie.

## Rozdzielenie statusów

| Zakres | Faktyczny stan |
| --- | --- |
| RUN-001 | source selection IMPLEMENTED; physical build NOT_RUN; global BLOCKED |
| DEV-001 | funkcjonalny rdzeń Node, docelowy Rust core OPEN |
| DEV-002–003 | 7 używalnych operacji lokalnych, katalog 200+ OPEN |
| DEV-004–005 | network i pełne security suites OPEN |
| DEV-006 | działający serwer MCP dla 7 narzędzi; pełna integracja Agent Gateway OPEN |
| DEV-007–008 | narzędzia GGUF i natywne Android OPEN |
| DEV-009–010 | ekran PL/EN IMPLEMENTED częściowo; favourites/history OPEN |
| DEV-011–012 | 200+ narzędzi i pełne bramki odbiorowe OPEN |
| Ω-INT-001–005, AND-001, ENT-52–54, V4-RAG, V4-VOICE, V4-AST, V4-MODELS, V4-RELEASE | wcześniejszy zakres wciąż częściowy/otwarty; niezaliczony tym przyrostem |

Żadnego GATE-09 nie oznaczono PASS. Nie utworzono gałęzi innych niż `main`, nie wykonano publikacji ani płatnych operacji.

## Ω-INT-001 — rozszerzenie integracji z realnym web runtime

- `apps/web/studio-http.mjs` importuje **istniejący** `compileProductionIntegration` z `overlays/omega-integrations/bridge.mjs` i udostępnia go jako `POST /api/local/studio/plan`. Nie tworzy nowego silnika.
- `studio-browser.mjs`, wspólny katalog, app router, serwer HTTP i lista zasobów web wskazują ten sam moduł. Dostęp przez nowy kafelek `Aether Studio — plan`.
- Egzekwowane są: lokalny host i Origin, nagłówek `x-omega-plan: 1`, JSON, limit wejścia 256 KiB, limit wyjścia 1 MiB oraz wyłącznie `PLAN_ONLY_NOT_BUILT` z `engine_adapter=NOT_CONNECTED`.
- `node --test locally-uncensored-enterprise/test/studio-http.test.mjs`: **4/4 PASS** w izolowanej kopii modułu z kontrolowanym adapterem (rzeczywiste HTTP); sam bridge ma osobne testy w repo, których nie ponowiono w tej sesji.
- **Łącznie nowych izolowanych testów w tej sesji: 22/22 PASS**. Bez builda, renderowania, fizycznej inferencji ani E2E Tauri/Android. Ω-INT-001 nadal PARTIAL, Ω-INT-002–005 pozostają do podłączenia przez analogiczne, kontrolowane granice.

## Ω-INT-002 — wykonawcza ścieżka CPU do istniejącego P09/QFV

- `apps/web/media-preview-runner.mjs` uruchamia w izolowanym trybie `python3 -I` wyłącznie przypiętą ścieżkę istniejącego `overlays/omega-integrations/media_bridge.py`; bez shell, bez ścieżki wskazywanej przez żądanie, z ograniczonym środowiskiem procesu.
- Maksymalnie dwa aktywne podprocesy, czas CPU preview do 10 sekund, limit wejścia 128 KiB, wyjścia 1 MiB, anulowanie z SIGKILL i walidacja schematu rezultatu. Testy `MEDIA-RUN-01–05`: **5/5 PASS**, używają kontrolowanego skryptu Python; nie stanowią fizycznego testu prawdziwego P09/QFV.
- `apps/web/media-preview-http.mjs` i launcher udostępniają `POST /api/local/media/preview` z loopback host, Origin, tokenem nagłówkowym `x-omega-preview: 1` i kontrolą `CPU_REFERENCE_PREVIEW_NO_VIDEO_RENDER`; testy `MEDIA-HTTP-01–03`: **3/3 PASS** dla realnego HTTP i kontrolowanego runnera.
- Zmienione pliki: `serve.mjs`, `app.mjs`, `build.mjs`, `packages/shared-ui/catalog.mjs`, skrypty testowe. UI otrzymało osobny kafelek P09/QFV.
- **Łącznie 30/30 izolowanych testów lokalnych PASS** (DEV HTTP/MCP, RUN routing, Studio HTTP, media runner/HTTP). Pełny checkout repo, Python media E2E, GPU, build React/Tauri, APK i GATE-09: **NOT_RUN / BLOCKED**.

Moduł P09/QFV jest włączony do lokalnego interfejsu, ale pełna ścieżka od źródeł obrazu/wideo przez trwały asset store, renderer, GPU, prawa dostępu i produkcyjny E2E pozostaje otwarta. Powyższe nie zamyka wymagań filmowych ani AAA.

## V4-MODELS — rzeczywiste ścieżki katalogu i ewaluacji PL/EN

- `apps/web/models-http.mjs` uruchamia istniejący `scripts/gguf-inventory.mjs::scanGGUF` dla ścieżki wskazanej przez lokalne `OMEGA_MODEL_DIR`, nie przez użytkownika HTTP; `models-browser.mjs` i katalog Integrated App udostępniają odczyt plików GGUF. **Brak inferencji i oceny tensorów**; wyłącznie nagłówki, rozmiary i heurystyka RAM.
- `scripts/model-eval.mjs` uruchamia ustrukturyzowane pytania PL/EN na istniejącym lokalnym serwerze OpenAI-compatible `http://127.0.0.1:PORT/v1/chat/completions` z parametrami `temperature=0, stream=false`; akceptuje maksymalnie 64 przypadki w CLI (w UI maksymalnie 12), ma ograniczenia rozmiaru odpowiedzi, timeout per-case i wyłącznie loopback URL. Punktacja: jawnie zadeklarowana znormalizowana zgodność tekstu, bez deklarowania globalnej jakości modelu.
- `apps/web/model-eval-http.mjs` używa `OMEGA_MODEL_EVAL_ENDPOINT` i ogranicza jednoczesne uruchomienia, rozmiar żądań oraz pochodzenie HTTP. `model-eval-browser.mjs` daje widok PL/EN. Żaden model ani dane nie są automatycznie wysyłane do chmury; w testach użyto lokalnego modelowanego serwera HTTP, **nie prawdziwych wag**.
- Lokalny Node 22.16: `tests/model-eval.test.mjs` **4/4 PASS** (rzeczywiste loopback HTTP z kontrolowanymi odpowiedziami); `test/model-eval-http.test.mjs` **3/3 PASS**; `test/models-http.test.mjs` **3/3 PASS**.

## Ω-INT-004 — lokalny OTCM/ATM/OmegOS

- `overlays/omega-integrations/knowledge_cli.py` wywołuje istniejący `knowledge_bridge.py::reconcile_as_of` z limitem 64 KiB, pamięcią tylko na czas żądania i dowodem pozostającym `NO_CHECKED_PROOF`.
- `apps/web/knowledge-runner.mjs` uruchamia jedynie przypięty adapter CLI `python3 -I` (2 równoległe procesy, maksymalnie 10 sekund, limit 1 MiB odpowiedzi, SIGKILL po timeout/cancel).
- `apps/web/knowledge-http.mjs` i `knowledge-browser.mjs` udostępniają ten istniejący most w GUI; lokalny HTTP wymaga loopback Host, Origin i specjalnego nagłówka. Brak wykonania akcji i retencji.
- Lokalny Node 22.16: `knowledge-runner.test.mjs` **4/4 PASS** (rzeczywisty kontrolowany proces Python, nie pełny OTCM), `knowledge-http.test.mjs` **3/3 PASS** (HTTP z kontrolowanym runnerem).
- **Łącznie w tej iteracji: 47/47 lokalnych testów izolowanych PASS** (30 wcześniejszych + 3 GGUF + 7 ewaluacji + 7 OTCM/ATM). Nadal nie są to rzeczywiste testy E2E aplikacji Tauri/Android czy produkcyjny benchmark LLM. Globalny GATE-09 **BLOCKED**.

## Ω-INT-003/005 — lokalne dopuszczenie inferencji i eksperymentów

- `overlays/omega-integrations/compute_cli.py` łączy istniejące klasy `mobile/reference/runtime_policy.py` oraz `inference/reference/inference_router.py` przez `compute_bridge.py`. Przyjmuje ściśle walidowaną deklarację modelu, pamięci, termiki i listy lokalnych backendów. Wymusza `OFFLINE`, puste granty, `egress_enabled=False`; zwraca tylko `ROUTE_PLAN_ONLY` lub `DENIED_OR_PAUSED`. Ani telemetria, ani katalog backendów dostarczony przez formularz nie są źródłem autorytatywnym; nie uruchamia to modelu.
- `overlays/omega-integrations/experiment_cli.py` wywołuje istniejące `experiment_bridge.py::plan_experiment` na kontraktach Attention/HAEE. Wymaga `allow_cloud=False` i `allow_dataset_egress=False`; status to `PLAN_ONLY_NOT_TRAINED`, bez trenera, GPU, podpisu OXA czy autopromocji.
- Oba moduły mają izolowane procesy Python z ustaloną ścieżką, ograniczeniem rozmiaru, czasu oraz dwoma równoległymi workerami; lokalne API `/api/local/compute/plan`, `/api/local/experiments/plan`; widoki PL/EN i wpisy rejestru launcher.
- `compute-runner.test.mjs` + `compute-http.test.mjs`: **6/6 PASS**; `experiment-runner.test.mjs` + `experiment-http.test.mjs`: **6/6 PASS**. Kontrolowane fixture Python i realne HTTP loopback, bez fizycznej inferencji i treningu.
- Wymagania Ω-INT-001–005 mają teraz lokalne ścieżki GUI/API do istniejących silników referencyjnych. Nie jest to pełna integracja z natywnym Tauri, Android JNI, realnym compute, prawami dostępu tenantów, rendererem ani trwałymi usługami; **GATE-09: BLOCKED**.

## Testy zbiorcze — 2026-11-25

- Komenda lokalna Node 22.16.0: `node --test` dla 15 zestawów ze zbioru: devsuite-service, devsuite-http, devsuite MCP, runtime-entry, Studio HTTP, media runner/HTTP, models inventory HTTP, model-eval CLI/HTTP, knowledge runner/HTTP, compute runner/HTTP, experiment runner/HTTP.
- Wynik: **59 testów PASS, 0 FAIL, 0 skipped**. Lokalny plik TAP: 11 019 bajtów, SHA-256 `b9552a20f3a9489667245f4d4356c4d548cb62aae9d2cdc5da6b05e499008838`.
- Izolowany test workspace zawierał kontrolowane zastępcze interfejsy upstream, staged-runtime, scanner GGUF i Aether bridge; testy ich adapterów i API nie są testami pełnych zależności. Brak pełnego checkoutu/klastra i buildów, przez co produkcyjne GATE-05/09 nie mogą otrzymać PASS.
- Tauri/React/Rust, Android APK, kompilacja aplikacji, rzeczywiste GGUF, rzeczywisty trening i rendering: **NOT_RUN** zgodnie z poleceniem operatora. Żaden z nowych lokalnych HTTP endpointów nie może być wystawiony poza loopback jako publiczne API. Brak zmiany polityki dotyczącej tylko gałęzi `main`.
