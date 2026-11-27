# OMEGA-X / Locally-XXX — Roadmapa i rejestr stanu

Data aktualizacji: 2026-11-20. Obowiązuje [VALIDATION_POLICY v3.0](VALIDATION_POLICY.md): niedostępną infrastrukturę zastępujemy deterministycznymi testami symulacyjnymi. Tryby NATIVE, DETERMINISTIC-SIMULATION i HYBRID. SIM-PASS zamyka przebadane kryterium inżynieryjne bez fizycznego powtórzenia; PHYSICAL jest wyłącznie informacją o faktycznym wykonaniu. Zewnętrzny audyt i zewnętrzna certyfikacja nie są wymaganiami odbiorowymi. [Dyrektywa v3.0](AUTONOMOUS_ENGINEERING_DIRECTIVE.md). Zasada: status `POTWIERDZONE` wymaga wskazania konkretnego dowodu, `CZĘŚCIOWE` oznacza brak przynajmniej jednego kryterium odbioru, `BRAK` oznacza brak kodu/dowodu w docelowym repozytorium.

| ID | Obszar | Status | Dowód / warunek domknięcia |
| --- | --- | --- | --- |
| MIG-001 | Punkt odniesienia upstream Locally Uncensored 2.6.7 | POTWIERDZONE | Gitlink do SHA `6d96ab92...`, `.gitmodules`, `scripts/upstream-gate.mjs` |
| MIG-002 | Oryginalne autorstwo i AGPL-3.0-only | POTWIERDZONE | README, źródłowe LICENSE i package.json; zachować oznaczenia |
| MIG-003 | Niezależna pełna kopia 1112 plików upstream | CZĘŚCIOWE | 1110/1112 rzeczywistych plików w `migration/staged/locally-uncensored/`; Rust 64/64, API 224/224, UI 177/177, stores 91/91, hooks 39/39, types 11/11, lib 305/305, E2E 16/16. Zgodność Git: SHA, rozmiar i tryb. Pozostały `docs/demo.gif` i `docs/social-preview.png` (BLOCKED: interfejs nie udostępnia binarnej zawartości >1 MB). Pełny build niepotwierdzony; zewnętrzny audyt nie jest wymagany. [Raport](MIGRATION_CHECKPOINT.json) |
| MIG-004 | OMEGA-X v1–v6 / archiwa i modele | IMPLEMENTED / PARTIALLY VERIFIED | `scripts/omega_import.py`: lokalne odtworzenie z kotwicą manifestu i kontrolą SHA-256, 6/6 testów. Zweryfikowano rzeczywiste bajty 1 archiwum (7 części, 4 211 392 B); pozostałe archiwa i integracja runtime otwarte. Brak publikacji prywatnych danych. |
| SEC-001 | Bramka niezmienności źródeł | TESTOWANE LOKALNIE | `scripts/upstream-gate.mjs`, `tests/upstream-gate-security.test.mjs` — 15/15 PASS w lokalnym środowisku Node 22.16.0, Git 2.47.3, Linux; pełne testy aplikacji osobno |
| SEC-003 | Niezależna walidacja materializacji źródeł względem przypiętego indeksu | ZAIMPLEMENTOWANE / TESTOWANE LOKALNIE | `scripts/index-trust.mjs`, `scripts/snapshot-integrity.mjs`, `scripts/vendorize.mjs` — 15/15 testów snapshotu i 11/11 importera; wspólna kotwica SHA-256, ścisła kontrola manifestu i trybów, weryfikacja przed publikacją. Pełna rzeczywista materializacja pozostaje otwarta |
| SEC-002 | Skan sekretów, licencji i zależności przed publikacją | IMPLEMENTED PARTIAL | Skan offline + przypięty OSV i 8 nowych testów lockfile. Ścisły JSON, zgodność bezpośrednich zależności/root i dokładnych wersji, kontrola deklarowanego źródła npm. Realne metadane 506 pakietów: brak rozbieżności w sprawdzonym zakresie. Pełny skan, kompletna baza OSV, licencje i weryfikacja bajtów zależności pozostają otwarte. |
| RAG-001 | RAG: XLSX, polskie znaki, limity PDF/DOCX/XLSX | NAKŁADKA ZAIMPLEMENTOWANA / TESTY MODUŁU PASS | `overlays/rag/`: 23 kotwice w czterech źródłach, 23 testy Chromium i 6 nowych TypeScript/Node. Jednoprzebiegowe BM25 exact-token, limity korpusu i wektorów, walidacja indeksów embeddingów, wybór rodziny backendu raz na operację. Pozostaje pełne uruchomienie nakładki w aplikacji, PDF.js/Mammoth i tożsamość modelu/backendu przy zmianie konfiguracji. |
| PL-001 | Morfologia domenowa i dowód relewancji pamięci PL | IMPLEMENTED / PARTIAL VERIFIED | 27 rodzin, wspólna tokenizacja, 9 nowych kotwic, 16 nowych testów + 6 regresji PASS; scorer z przypiętego źródła, fallback store zintegrowany statycznie. Pełna aplikacja i generalizacja językowa otwarte. [Dowody](OMEGA_V4_PL_EVIDENCE.md) |
| RUN-002 | Przygotowanie zweryfikowanego katalogu roboczego bez submodułu | TESTOWANE LOKALNIE | `scripts/staged-runtime.mjs`, 18/18 testów; zakotwiczenie SHA-256 indeksu, jawne odstępstwo tylko dla 2 zasobów dokumentacji. Porównano indeks 1112/1112 z drzewem upstream. Build i rzeczywisty snapshot lokalnie nieuruchomione. |
| RUN-001 | Desktop build Tauri/React/Rust | SIM-PASS (orkiestracja) / PHYSICAL NOT_RUN | Produkcyjny kontroler procesów `scripts/runtime_control.py`: 6/6 testów, SIM-RUN-01..03. Lokalny proces/timeout, symulowany toolchain, bezpieczny restart. Faktyczny build i binarium aplikacji niepotwierdzone. |
| AND-001 | Natywne APK Android / Termux / S24 Ultra | IMPLEMENTED PARTIAL | SIM-AND-03 SIM-PASS; rozszerzenie rzeczywistego MainActivity Tauri 2.10.1 (`overlays/android/`, `runtime:build --native-lifecycle`), 8 testów Python + 8 Kotlin/JVM z modelowanym SDK; prywatny checkpoint, fencing Activity, wykrycie zmiany procesu, ARM64, backup false, przypięty podpis/pakiet. SIM-AND-01/02 pozostają PARTIAL: Rust mobile entrypoint, WebView IPC i odtworzenie sesji/zadań GPU. Fizyczne powtórzenie zaliczonych kontraktów niewymagane. |
| GGUF-001 | Offline inwentaryzacja GGUF i heurystyka RAM | IMPLEMENTED / TESTED (STRUKTURA) | `scripts/gguf-inventory.mjs` (9 testów) i `scripts/gguf_layout.py` (9 testów): kontrola wymiarów, bloków, offsetów, wyrównania, kolizji i granic pliku; nieznane typy odrzucane. Bez rzeczywistych wag ani inferencji. |
| GPU-001 | Lokalna inferencja GGUF / ComfyUI / 8K | SIM-PASS (9-bramkowa macierz: zakres GPU) | SIM-GPU-01/02/03 zaliczone. HYBRID: istniejąca ścieżka managed GPU + nadzór dedykowanego procesu, ograniczony restart wyłącznie na bezpiecznej granicy, kontrola właściciela socketu, stop aktywnego własnego backendu bez działania na obcym procesie, kwarantanna niepewnego POST. 6 kafli / 6 POST po rzeczywistym restarcie testowego backendu. Integracja funkcji z UI pozostaje implementacyjnym wymaganiem aplikacji; rzeczywiste modele i fizyczna telemetria NOT_RUN, niewymagane do powtórzenia zaliczonej symulacji. |
| CI-001 | Bezpłatna walidacja offline | TESTOWANE LOKALNIE (BRAMKI) | 78/78 Node, 149/149 Python, 23/23 Chromium, 8/8 Kotlin/JVM — 258 unikatowych testów PASS; 50 zgodnych blob SHA. Pełny build aplikacji NOT_RUN; bez płatnych runnerów. |

## Kolejność domknięcia

1. Weryfikacja źródła, licencji i stanu repozytorium (`MIG-001`, `MIG-002`, `SEC-001`).
2. Import kompletnego drzewa źródeł do docelowego repo i porównanie SHA, bez uruchamiania płatnego CI (`MIG-003`).
3. Selektywny import autorskich modułów OMEGA-X po kontroli pochodzenia, licencji i sekretów (`MIG-004`, `SEC-002`).
4. Integracja RAG i testów regresyjnych; pełny build desktop (`RAG-001`, `RUN-001`).
5. Oddzielna ścieżka Android ARM64 i deterministyczna walidacja granic niedostępnej infrastruktury (`AND-001`).
6. Testy generacji i awarii z kontrolowanymi adapterami (`GPU-001`). Weryfikacja fizyczna i rzeczywiste wydanie są odrębnie rejestrowane, bez obowiązku powtarzania zaliczonych kryteriów symulacyjnych. Nie blokują zamknięcia inżynieryjnego.

Brak zielonego testu w tej tabeli nie jest równoznaczny z awarią; oznacza brak potwierdzonego dowodu w docelowym repozytorium.

## OMEGA-X v4 — przekazana specyfikacja rozszerzeń

Baza nadal 2.6.7 (nie 3.0.10). Wymagania muszą zostać zweryfikowane względem dostępnego drzewa, bez przyjmowania zgodności numerów plików lub zgłoszeń upstream.

| ID | Zakres | Stan |
|---|---|---|
| V4-I18N | UI, katalog, onboarding, persony PL/EN | IMPLEMENTED PARTIAL — polski domyślny, przełącznik PL/EN, migracja ustawień v22, nawigacja, fragmenty ustawień/onboardingu i nazwy person; 6 testów modułu PASS; katalog, pozostałe UI, pełny React/E2E otwarte |
| V4-ANDROID | Nazwa, zasoby PL, opcjonalne package ID oraz spójność release | IMPLEMENTED PARTIAL — rebranding poziomu 1 przez `runtime:android-brand` lub `runtime:build --android-brand`; 8 testów XML/kontraktu PASS, package ID zachowany, finalny APK i podpis NOT_RUN |
| V4-RAG | Natywna ingestia, SQLite-vec, embedding wielojęzyczny | IMPLEMENTED PARTIAL — lokalny proces ekstrakcji TXT/PDF/DOCX/XLSX poza WebView, Rust IPC na Linuksie; 7 testów rzeczywistych plików/procesu PASS. Parser Rust, sqlite-vec, embedding wielojęzyczny i Tauri E2E nadal otwarte |
| V4-VOICE | PL STT/TTS, segmentacja skrótów, zdalny voice z bramką | IMPLEMENTED PARTIAL — PL/EN w Whisper, Piper Gosia w pickerze, segmentacja skrótów, język systemowego TTS, bezpieczny temp audio; 4 testy TS PASS. Rzeczywiste STT/TTS, Android i zdalny Opus NOT_RUN/OPEN |
| V4-IPC | Zdarzenia postępu i telemetria zamiast pollingu | IMPLEMENTED PARTIAL — watch/rejestr Rust i Tauri Channel, EWMA 250 ms, ETA, odrzucanie spóźnionych zdarzeń; 3 testy TS PASS, 2 testy Rust NOT_RUN, web pozostaje przy pollingu |
| V4-GPU | KV-slot handoff, kompatybilna kwantyzacja, kontekst i narzędzia | IMPLEMENTED PARTIAL — kontroler CLI checkpointów KV z tożsamością modelu/scope i integralnością; 6/6 testów, lokalny HTTP z modelowanym serwerem. Rzeczywisty llama.cpp, integracja istniejącego Tauri IPC, automatyczny handoff i kwantyzacja OPEN |
| V4-SEC | Izolacja procesów na poziomie OS, PL sensitive patterns | IMPLEMENTED PARTIAL — Linux Bubblewrap, deny-by-default bez adaptera, ograniczony workspace i wejście; 3 testy Rust dodane, NOT_RUN; Windows/macOS/Android i PL Computer Control otwarte; brak gwarancji izolacji tenantów |
| V4-AST | Natywny indeks AST | IMPLEMENTED PARTIAL — rzeczywisty TypeScript Compiler API, indeks TS/JS i deterministyczny graf importów; 5/5 testów. Natywny Rust/Tree-sitter, LSP, aliasy i integracja repo_map OPEN |
| V4-THERMAL | Android thermal listener | IMPLEMENTED PARTIAL — Kotlin API29+, PowerManager, 1 Hz, histereza 15 s, minimum 1024 MiB, integracja Activity; dwa scenariusze JVM z modelowanym SDK i 8/8 regresji cyklu życia PASS. IPC admission i pomiar fizyczny OPEN |
| V4-MODELS | Lokalny katalog polskich modeli i neutralna ewaluacja PL/EN jakości | OPEN |
| V4-RELEASE | Kompilacja i testy całej aplikacji, APK | OPEN |

Dowody przyrostu V4-I18N / V4-ANDROID / V4-SEC: [OMEGA_V4_LOCALIZATION_SECURITY_EVIDENCE.md](OMEGA_V4_LOCALIZATION_SECURITY_EVIDENCE.md). Wszystkie trzy pozostają częściowe; bramki wydaniowe nie zostały zamknięte.

Dowody przyrostu V4-RAG / V4-VOICE / V4-IPC: [OMEGA_V4_RAG_VOICE_IPC_EVIDENCE.md](OMEGA_V4_RAG_VOICE_IPC_EVIDENCE.md).

Dowody przyrostu V4-GPU / V4-AST / V4-THERMAL: [OMEGA_V4_GPU_AST_THERMAL_EVIDENCE.md](OMEGA_V4_GPU_AST_THERMAL_EVIDENCE.md).

## Enterprise — odrębne rozszerzenie monorepo

[ENTERPRISE_ROADMAP.md](ENTERPRISE_ROADMAP.md) jest normatywnym rejestrem rozszerzenia. Pierwszy kompilator kontraktów grafu agentów (ENT-02) — 7/7 testów lokalnych PASS; bootstrap pnpm, PostgreSQL/pgvector i Redis — IMPLEMENTED PARTIAL, bez potwierdzonego uruchomienia kontenerów. Nie zastępuje ani nie usuwa pozycji V4.

Przyrost ENT-05/06/07: lokalnie testowana warstwa JWT/JWKS + HTTP PDP + AIM, 12/12 PASS; integracja realnych usług i bramek wykonawczych pozostaje otwarta. Rozszerzono Enterprise o ENT-18..30 (Integrated App, mobile agent, Codespace, Training Studio, koparki, Virtual Number i ODYN) — [specyfikacja](INTEGRATED_APP_SPEC.md), [dowody](OMEGA_ENT_AUTH_EVIDENCE.md).

Przyrost ENT-03/04/08: repozytorium pgvector, review_tasks, FlowProducer i worker Temporal; 16 nowych testów + 12 regresji PASS; rzeczywiste SDK/klaster NOT_RUN. [Dowody](OMEGA_ENT_EXECUTION_EVIDENCE.md), [nowe kontrakty architektury](ENTERPRISE_ARCHITECTURE_INCREMENT.md).

ENT-09/10/11: kontrolowany DAG runner, per-tool gate, adaptery search i gVisor; 17/17 testów nowego zestawu PASS, pełne integracje NOT_RUN. [Dowody](OMEGA_ENT_TOOL_RUNTIME_EVIDENCE.md). Rozszerzenie ustawień i ComfyUI: [specyfikacja](SETTINGS_OPTIMIZATION_SPEC.md), ENT-31/32.

ENT-12/15/16: ResourceArbiter, gradient context scheduler, AES-GCM SQLite checkpoints; 15 nowych + 17 regresji PASS, rzeczywisty SIGKILL po commit. [Dowody](OMEGA_ENT_RESOURCE_EVIDENCE.md). Nowe ENT-33..36: [media, remote access i licencje](ENTERPRISE_MEDIA_REMOTE_SPEC.md).

ENT-13/14/18: pierwszy lokalny web shell, 18 kafelków, workspace, AST inspector, typowany SDK/CLI i HTTP proxy; 9/9 lokalnych testów PASS, TS strict PASS, browser E2E BLOCKED. [Dowody](OMEGA_ENT_UI_EVIDENCE.md).

ENT-19/20/30: Kotlin mobile read-only, lokalny Codespace Git z weryfikacją SHA-256 i TypeScript AST App Builder; 11/11 testów Node PASS i Kotlin/JVM policy PASS. [Dowody](OMEGA_ENT_MOBILE_CODESPACE_BUILDER_EVIDENCE.md). Globalny GATE-09 niezaliczony.

ENT-21/22/23: przygotowanie danych SFT/LoRA/QLoRA offline, dwufazowe Mining Control, Twilio Virtual Number inventory/search/SMS adapter. 13/13 testów lokalnych PASS, live operations NOT_RUN; [dowody](OMEGA_ENT_TRAINING_MINING_TELECOM_EVIDENCE.md). GATE-09 PARTIAL.

ENT-37..40: zintegrowane cztery interfejsy (konwerter JPG/PNG/WebP, JSON/ENV/YAML, knowledge z adapterem pgvector, kalkulator + MCP). 16/16 testów lokalnych PASS, realny browser/DB/GPU E2E OPEN. [Dowody](OMEGA_ENT_EXTERNAL_INTEGRATIONS.md).

ENT-41/42/43: lokalny indeks wyszukiwania/filtrowania katalogów, poprawiona geometria skalowania iframe oraz deterministyczny algorytm podziału historycznego budżetu tokenów. 12 nowych testów i 5 regresji PASS w izolowanym środowisku Node, pełne GUI/Model Manager/Agent Registry E2E OPEN. [Dowody](OMEGA_ENT_CATALOG_VIEWPORT_CONTEXT_EVIDENCE.md).

ENT-44..46 Cloud Multi-Provider: zintegrowana, domyślnie wyłączona bramka siedmiu dostawców z bezpiecznym magazynem AES-GCM, HTTP OIDC/PDP, jednorazowymi zgodami i SSE przez localhost web proxy. 19 lokalnych testów PASS; brak live E2E i produkcyjnych kontroli kosztów. [Dowody](OMEGA_ENT_CLOUD_GATEWAY_EVIDENCE.md).

ENT-47..49: Awesome Workspace (10 referencji z uczciwymi statusami, launcher i CLI), bezpieczny benchmark Ollama na loopback ze źródłowymi metrykami oraz deterministyczny HTML/PDF exporter. 12/12 testów nowego przyrostu PASS, rzeczywisty Ollama, React/Tauri/Android, renderer cross-platform i pełne GUI E2E NOT_RUN. [Dowody](OMEGA_ENT_AWESOME_EVIDENCE.md).

ENT-44/46 QTA-01..10 (2026-11-21): atomowa rezerwacja dziennych limitów wywołań i maksymalnych tokenów odpowiedzi per tenant w prywatnym SQLite; brak limitów uniemożliwia uruchomienie aktywnego Cloud Gateway. Status API pokazuje wykorzystanie. Nowe testy 10/10 PASS (lokalny HTTP i syntetyczny provider), pełny backend i fizyczny dostawca NOT_RUN. Nie stanowi finansowego limitu kosztów. [Dowody](OMEGA_ENT_CLOUD_QUOTA_EVIDENCE.md). GATE-09 OPEN.

ENT-29 AUD-01..13 (2026-11-21): implementacja lokalnego dziennika etapów wykonania DAG i Agent Runtime z HMAC tenant-scoped oraz HTTP/SSE po OIDC/PDP. Zdarzenia nie przechowują promptów, wyników narzędzi ani prywatnego rozumowania. 13/13 testów lokalnych PASS; pełny backend/GUI/E2E i produkcyjny IdP/PDP/OTel NOT_RUN. [Dowody](OMEGA_ENT_OBSERVABILITY_EVIDENCE.md). **ENT-29 PARTIAL, GATE-09 OPEN.**

ENT-29/APX-01..04: `apps/web/serve.mjs` proxy same-origin dla API audytu i SSE, limit 4 KiB wejścia, tylko loopback, bez forwardowania cookies. 4/4 nowe testy PASS, 17/17 razem z AUD; pełny web build/E2E nadal NOT_RUN. [Dowody](OMEGA_ENT_OBSERVABILITY_EVIDENCE.md). ENT-29 PARTIAL, GATE-09 OPEN.

ENT-50 (2026-11-21): Awesome GFlow MCP / Vertex Veo — oficjalny endpoint Google Cloud `predictLongRunning`, `fetchPredictOperation` przez domyślnie wyłączoną bibliotekę, Master Prompt JSON, lokalny MCP kompilacji, per-tenant SQLite idempotency i limity, bez nieudokumentowanych prywatnych endpointów Google Flow. Testy GF-01..21 21/21 PASS (mock HTTP + prawdziwe SQLite/MCP subprocess). Produkcyjny OAuth/SSO, zgoda operatora, Flow GUI, realny Veo E2E, pakowanie Android, tożsamości referencyjne, extend/upscale pozostają OPEN. [Dowody](OMEGA_ENT_GFLOW_EVIDENCE.md). ENT-50 PARTIAL; GATE-09 OPEN.

ENT-51 (2026-11-21) — OMEGA Omniverse Android Foundation: bezpieczny dwufazowy Kotlin/JVM Memory Lease Broker (zintegrowany z OmegaThermalMonitor), weryfikacja wolnej pamięci i stanu termicznego przed rezerwacją, polityka agentowa CaMeL-inspired (quarantined=zero tools, taint/readers/capabilities), adapter istniejącego MobileAgent, aktualizacja instalatora overlay tylko dla kryptograficznie rozpoznanych wersji. Nowe testy MEM-01..10, CAM-01..06, zgodność starego MobileAgent i modelowany monitor Android: PASS lokalnie. Android SDK/NDK, Rust/Kani, JNI, realny S24, fizyczne modele GPU/NPU, FGS i pełna regresja Python/JVM NOT_RUN. **ENT-51 PARTIAL; GATE-09 OPEN.** [Dowody](OMEGA_OMNIVERSE_ANDROID_ENT51_EVIDENCE.md).

ENT-51/PSZ-01..10: rzeczywisty parser ELF64 EM_AARCH64/PT_LOAD i offsetów ZIP przeprowadza preflight 16 KiB na APK/AAB w `scripts/verify_android_pagesize.py` (AAB nie ma PASS aż do weryfikacji APK). 10/10 testów deterministycznych na syntetycznych ELF/ZIP PASS. Prawdziwy APK z NDK r28+ i fizyczny Android NOT_RUN. [Dowody](OMEGA_OMNIVERSE_ANDROID_ENT51_EVIDENCE.md). ENT-51 PARTIAL, GATE-09 OPEN.

ENT-52 (2026-11-21) — in-process Dual-GGUF Android lifecycle orchestration: dodano `OmegaNativeModelCoordinator` i adapter do istniejącego `OmegaThermalMonitor`. Natywny model przyjmowany dopiero po rezerwacji, a ofiary zwalniane fizycznie przed zatwierdzeniem nowej dzierżawy; awarie częściowego ładowania i niepewnego unload pozostawiają konserwatywną rezerwację. Wstępna walidacja GGUF w prywatnym katalogu i przekazanie jednego deskryptora pliku. NMC-01..10: 10/10 PASS w kotlinc/JVM, adapter kompiluje się na stubach Android API. Realne JNI/llama.cpp, Kani/Rust, fizyczny S24 Ultra, całkowita regresja Kotlin/Python, APK/AAB 16 KB NOT_RUN. [Dowody](OMEGA_ENT52_DUAL_GGUF_LIFECYCLE_EVIDENCE.md). **ENT-52 PARTIAL; GATE-09 OPEN.**

ENT-53 (2026-11-21) — in-process C++20/JNI llama.cpp Dual-GGUF loader: native RAII model/context per slot, dynamic JNI bridge `NativeLlamaEngine`, `ParcelFileDescriptor.dup` Android adapter held in separate gated native module, Android-only CMake pins upstream llama.cpp `418fe97b5f01...` and 16 KiB ELF alignment. Host `clang++ -Wall -Wextra -Werror` + ASan/UBSan lifecycle 9/9 PASS, real Kotlin/JNI-host smoke with fake llama 8/8 PASS. ARM64 NDK/Gradle, actual model load+decode, physical S24, app integration, bundled `.so`, full security E2E NOT_RUN. [Evidence](OMEGA_ENT53_LLAMA_JNI_EVIDENCE.md). **ENT-53 PARTIAL; GATE-09 OPEN.**

ENT-54 (2026-11-21) — native generacja tokenów `llama.cpp` przez przypięte API `llama_batch_ext` + `llama_process`: dwa niezależne konteksty, limitowane prefill/decode, restart KV na żądanie, per-slot cancellation, zabezpieczony UTF-8 przez JNI ByteArray, błędy ContextFull/BackendError; opcjonalny fail-closed instalator Android Tauri `scripts/install_android_llama.py` z pin SHA, rollback i blokadą współbieżności, Gradle `externalNativeBuild` + NDK r28 arm64. Testy lokalne: C++ RAII 9/9, generacja C++ 10/10, JNI lifecycle 8/8, JNI generacja 8/8, instalator 8/8; kontrakt Kotlin broker+JNI kompiluje się na atrapach API. Prawdziwy `llama.cpp` + model GGUF, NDK build, 16 KB APK/ELF, fizyczny S24, GPU/NPU, streaming UI i pełny E2E **NOT_RUN**. [Dowody](OMEGA_ENT54_GENERATION_AND_ANDROID_INSTALL_EVIDENCE.md). **ENT-54 PARTIAL; GATE-09 OPEN.**


## Ω-INT-001 — Utrwalona integracja referencyjnych silników (2026-11-23)

Stan: **IMPLEMENTED + HOST-TESTED / PARTIAL INTEGRATION**. Bazowy commit poprzedzający przyrost: `86013e4f5e85dcd12ab1d9925fdfc0d529a9edcb`. Katalog `overlays/omega-integrations/` zawiera 12 izolowanych, przypiętych SHA-256 pakietów źródłowych z wcześniejszych specyfikacji. Uruchamialny most `bridge.mjs` łączy **Aether Studio + P10 Cinema/Cutscenes**: wspólny plan projektu, kontrolę praw do zasobów, grafy narracyjne, manifesty scen, adaptacyjny plan muzyczny i blokadę wydania bez dowodów. Komenda `npm run test:omega-integrations` weryfikuje wszystkie pakiety i most.

Weryfikacja hostowa przed zapisem: 14/14 zestawów PASS (`overlays/omega-integrations/LOCAL_VERIFICATION.json`); hash-lock `SOURCE_LOCK.json`, manifest integracji `INTEGRATION_MATRIX.md`. Trwała izolacja: nie zmieniać przypiętego upstream. **Wciąż NOT_INTEGRATED_WITH_APP:** P09 Firefly, QFV, ATM, OTCM, AETHR, Inference Router, Mobile, Attention/PEFT, HAEE, OmegOS — kod referencyjny dostępny w repo, brak połączenia z runtime. Nie testowano natywnego Androida, renderera, GPU, E2E ani wydania produktu. GATE-09: **BLOCKED**, nie domykać pozornie.


### Ω-INT-002 — Wykonywalny most P09 Firefly Elements ↔ QFV (2026-11-23)

Stan: **IMPLEMENTED / HOST TESTED / PRODUCTION PARTIAL**. `overlays/omega-integrations/media_bridge.py` uruchamia rzeczywiste referencyjne `ElementRegistry` i `VideoPrompt` z P09 oraz `FieldDeformer` QFV w jednym bezsieciowym procesie CPU, na jawnie autoryzowanych asset refs; `@mentions` i 3D wektory zachowują kontrakt. Bramka ogranicza wejście do 512 KiB, siatkę do 1000 wierzchołków, 64 emitery i czas deformacji do 5 s; na błędnych typach fail-closed bez uruchamiania renderera. 15 nowych testów `tests/test_media_bridge.py` (w tym reprodukcja błędu malformed URI, RED→GREEN), 15/15 zestawów lokalnych PASS. `npm run media:preview < examples/media-preview.json`. Wciąż nie jest to UI, renderer wideo, sprzętowy QFV, ani fizyczne Android E2E. GATE-09: **BLOCKED**.


### Ω-INT-003 — Inference Gateway + Mobile resource admission (2026-11-23)

**IMPLEMENTED / HOST TESTED / PRODUCTION PARTIAL.** `overlays/omega-integrations/compute_bridge.py` łączy rzeczywiste referencyjne selektory `reference/inference_router.py` i `reference/runtime_policy.py`. Sprawdza spójność tenant/principal, identyczny lease RAM, tryb OFFLINE/HYBRID/CLOUD_HPC, pozwolenia cloud, zdrowie i przypięcie wersji backendu, termikę/baterię oraz brak zdalnej transmisji PRIVATE/RESTRICTED. Przy lokalnej decyzji nie dokonuje ukrytej migracji do chmury. 17 nowych testów `tests/test_compute_bridge.py`, reprodukcja malformed runtime inventory RED→GREEN. Łącznie 16/16 lokalnych zestawów PASS. Uruchomienie demonstracji: `npm run compute:plan`. **NOT_RUN** rzeczywista inferencja modelu, Telemetry Android, GPU/NPU, sieć, produkcyjna autoryzacja grantów. Wykonany selektor zwraca wyłącznie plan `ROUTE_PLAN_ONLY`; GATE-09 **BLOCKED**.


### Ω-INT-004 — OTCM → ATM → OmegOS knowledge/proof gateway (2026-11-23)

Stan: **IMPLEMENTED + HOST TESTED / PRODUCTION PARTIAL**. `overlays/omega-integrations/knowledge_bridge.py` wykonuje rzeczywisty odczyt OTCM (ephemeral SQLite), interpretuje świadectwa przez czterowartościową logikę ATM i waliduje żądanie dowodu za pomocą dostarczonego JSON Schema OmegOS. **Żadnego** uruchomionego solwera, dowodu formalnego, trwałej bazy OCX ani automatycznie autoryzowanej akcji. Sprzeczne świadectwa zachowują status BOTH; bramka pozostaje DEFERRED, nawet jeśli brak konfliktu i nie ma sprawdzonego dowodu. 14 nowych testów; RED→GREEN dla tenanta z białymi znakami i niedozwolonego odwzorowania przyszłej daty w ATM; 17/17 lokalnych zestawów PASS. Demonstracja: `npm run knowledge:reconcile`. GATE-09 **BLOCKED**.


### Ω-INT-005 — Attention/PEFT → HAEE → signed .oxa experiment artifact (2026-11-23)

Stan: **IMPLEMENTED / HOST-TESTED / PRODUCTION PARTIAL**. `overlays/omega-integrations/experiment_bridge.py` wykonuje prawdziwy referencyjny Attention planner, waliduje eksperyment HAEE przez JSON Schema, weryfikuje zgodność tenantów, budżetów i jawnych zezwoleń egress/cloud oraz używa rzeczywistego AETHR OXA1 do podpisania **artefaktu DATA**, nie modelu wykonywalnego. `verify_signed_plan` przyjmuje zewnętrzny klucz Ed25519 i ponownie weryfikuje hash planu. 20 nowych testów RED→GREEN + regresja; **18/18 lokalnych zestawów PASS**, szczegóły `LOCAL_VERIFICATION.json`. CLI `npm run experiment:plan` korzysta z efemerycznego testowego klucza, bez trwałej tożsamości i bez wydania kosztów chmurowych. Wynik: `PLAN_ONLY_NOT_TRAINED`; **nie** wykonano treningu GPU, fine-tuningu, eksperymentów HAEE/DGM, budowy runtime, oceny modeli czy E2E. GATE-09 **BLOCKED**.

## 2026-11-25 — przyrost integracyjny bez kompilacji

**Polityka:** wyłącznie `main`, bez kompilacji finalnej, APK, publikacji i płatnej infrastruktury do dyspozycji operatora. Dowody: [OMEGA_IMPLEMENTATION_2026-11-25.md](OMEGA_IMPLEMENTATION_2026-11-25.md).

| ID | Zmiana kodu w repozytorium | Status i niezamknięte kryterium |
| --- | --- | --- |
| RUN-001 | `scripts/runtime-entry.mjs`: wybór przypiętego upstream albo zweryfikowanego staging oraz przekierowanie skryptów `package.json` | IMPLEMENTED PARTIAL; full app build NOT_RUN |
| Ω-INT-001 | Aether/P10 z istniejącego `bridge.mjs` do lokalnego Enterprise API i PL/EN GUI | IMPLEMENTED PARTIAL; engine adapter niepodłączony |
| Ω-INT-002 | QFV/P09 CPU reference z istniejącego Python bridge do GUI/API przez bounded subprocess | IMPLEMENTED PARTIAL; render i GPU NOT_RUN |
| Ω-INT-003 | `compute_cli.py`: offline-only Mobile/Inference Gateway policy + lokalna karta UI | IMPLEMENTED PARTIAL; telemetria i realny backend niezweryfikowane |
| Ω-INT-004 | `knowledge_cli.py`: OTCM/ATM reconciliation z wyraźnym `NO_CHECKED_PROOF` | IMPLEMENTED PARTIAL; persistence i formal checker OPEN |
| Ω-INT-005 | `experiment_cli.py`: Attention/HAEE planning bez trenera, klucza i chmury | IMPLEMENTED PARTIAL; trening, podpis i OXA release OPEN |
| V4-MODELS | GGUF header scanner GUI, lokalny rzeczywisty protokół ewaluacji PL/EN z punktacją exact-match | IMPLEMENTED PARTIAL; rzeczywiste wagi i referencyjny benchmark NOT_RUN |
| DEV-001–012 | 7 bazowych + 15 rozszerzonych realnych operacji offline w GUI/MCP/local API, razem 22 | IMPLEMENTED PARTIAL; Rust core, 200+, usługi sieciowe i Android adapter OPEN |
| ENT-54 | JNI native token-by-token byte sink i Kotlin UTF-8 incremental decoder | IMPLEMENTED PARTIAL; testy natywne, Android/Tauri IPC i fizyczna inferencja NOT_RUN |
| AND-001 / ENT-52–53 | Zachowane istniejące Android ARM64, dual GGUF, memory admission i JNI | PARTIAL; fizyczne ABI i E2E NOT_RUN |
| V4-RAG, V4-VOICE, V4-AST | Wcześniejsze nakładki pozostają; nie zostały domknięte w tym przyroście | PARTIAL / OPEN |
| V4-RELEASE / GATE-09 | Nie wykonano builda finalnego ani dystrybucji | **BLOCKED** zgodnie z wstrzymaniem kompilacji |

Lokalna, izolowana macierz testów JS/HTTP/IPC wykonała **59/59 PASS** (adaptery z kontrolowanymi źródłami zależności i odpowiedziami, nie pełny checkout). Dodatkowe 15 narzędzi offline: **6/6 PASS**, dispatcher/MCP rozszerzony: **17/17 PASS** w weryfikacji celowanej. Testy `tests/native` z nowymi asercjami JNI pozostają **NOT_RUN**. Odbioru produkcyjnego z powyższych wyników nie wolno wywodzić.

### 2026-11-26 — DEV cURL literal-body and command safety

DEV remains **IMPLEMENTED PARTIAL**. NET-06..08: RED 3 FAIL / GREEN 8/8 PASS (including 5 existing tests); NET-09 native loopback contract PASS. Generator disables implicit curl configuration and URL globbing, restricts protocols, preserves literal `@` bodies and rejects NUL. Full DevSuite, GUI/MCP regression and global GATE-09 remain OPEN. [Evidence](OMEGA_DEV_CURL_SECURITY_2026-11-26.md).

### 2026-11-27 — ENT-49 / PDF launcher integration
Added PDF Reports tile, navigation mount, build asset mapping, static allowlist and HTTP dispatch to the existing offline PDF renderer. Catalog now declares 33 tiles / 19 available entries. PDF-WIRE-01..04: static source checks RED 0/4 then GREEN 4/4. PDF-HTTP-01..06: one native Node test with six HTTP cases against the exact existing handler and real ReportLab 4.4.9, PASS; deterministic PDF bytes, origin rejection, schema rejection, wrong method and oversized body. Test source blob 4afc92e964aae76fb9da2ee5b402efc5f73003e6; native log SHA-256 f29f7c49cca5137acaaa62dd16880e0c26992f4d58032437bbf3caa210e7c79c. Environment Linux, Node 22.16.0; GitHub connector used, full checkout unavailable (DNS), Rust absent. Command: `node --test test/pdf-local.integration.mjs` from Enterprise root. Full web build, launcher browser E2E, Android, signing and whole-product GATE-09 remain OPEN. See [evidence](OMEGA_ENT49_PDF_WIRING_2026-11-27.md).

### 2026-11-27 — local text chat / ENT-12/18
Added bounded multi-turn loopback chat route, session UI and launcher wiring (33 catalog entries, 20 enabled in source). 4 new HTTP/model-fixture tests and 4 model-eval regression tests PASS. Browser syntax PASS; isolated Chromium navigation blocked by environment policy. Full build/model inference NOT_RUN. No streaming, persistent history, RAG, vision, tool calls or resource-broker integration yet. ENT-12/18 remain PARTIAL; GATE-09 OPEN. [Evidence](OMEGA_LOCAL_CHAT_2026-11-27.md).

### 2026-11-27 — ENT-21 / local training dataset UI
Integrated existing deterministic dataset preparation into launcher (33 entries, 21 enabled); local-only JSONL upload/paste, 5–40% evaluation split, export train/eval/manifest, no execution of training. TRWEB-01..04 native HTTP PASS against exact existing dataset source; UI syntax PASS, full build/browser E2E NOT_RUN. ENT-21 PARTIAL; GATE-09 OPEN. [Evidence](OMEGA_ENT21_TRAINING_UI_2026-11-27.md).

### 2026-11-27 — ENT-29 / operations audit UI
Integrated read-only authenticated audit list UI with existing same-origin proxy. 33 entries, 22 enabled. OPWEB-01..05 + TRWEB-01..04 regression 9/9 PASS; actual HMAC SQLite and HTTP, modelled external IdP/PDP, no UI browser execution. ENT-29 PARTIAL, GATE-09 OPEN. [Evidence](OMEGA_ENT29_OPERATIONS_UI_2026-11-27.md).

### 2026-11-27 — local artifact storage / ENT-16, ENT-18
Added opt-in single-operator loopback file vault with AES-256-GCM payloads, SHA-256 content IDs, immutable deduplication, list, download and confirmed deletion; 4 MiB/file, 64 MiB logical data, 128 entries. 33 catalog entries, 23 wired. STOR-01..04 native SQLite/HTTP PASS. Full web build/browser E2E, tenant-scoped shared storage, key rotation, backup and cloud sync remain OPEN. Metadata is not encrypted; local mode is not enterprise authentication. [Evidence](OMEGA_LOCAL_STORAGE_2026-11-27.md).

### 2026-11-27 — local Photo Studio / ENT-12, ENT-18
Added offline 8-bit sRGB raster corrections (exposure, contrast, saturation, artistic warmth, monochrome), preview/export, raster header preflight; uses existing raster signature module. 33 launcher entries, 24 wired. PHOTO-01..04 native Node PASS, PHOTO-05 isolated real Chromium PNG decode/adjustment/download PASS; storage regression 4/4 PASS. JPEG/WebP header tests only, full launcher E2E/build NOT_RUN, RAW/ICC/16-bit/tiled, advanced editing and AI open. [Evidence](OMEGA_PHOTO_STUDIO_2026-11-27.md).

### 2026-11-27 — Audio Studio / local PCM16 WAV editing
Added bounded local WAV import, trim, gain, peak normalization and export; wired launcher, build and static allowlist (25/33 entries wired). AUD-01..04 native Node PASS; AUD-05 actual FFmpeg-generated stereo WAV edited by production code and decoded successfully, 48 kHz / 0.100 s. Full browser/launcher/build, STT/TTS, music generation and non-PCM16 codecs remain OPEN. [Evidence](OMEGA_AUDIO_STUDIO_2026-11-27.md).

### 2026-11-27 — ENT-22/23 concurrent approval safety
Fixed reproducible TOCTOU on both command and SMS approval after asynchronous policy checks. Recheck pending object identity, state, deadline and principal immediately before synchronous reservation; deny duplicate or expired confirmation. MINE-RACE-01..03 and PHONE-RACE-01..03 RED 2/6, GREEN 6/6 PASS (deterministic transport fixtures). No hardware command or SMS sent. Durable cross-process idempotency, live provider, UI and full suite OPEN. [Evidence](OMEGA_ENT22_23_APPROVAL_RACE_2026-11-27.md).

### 2026-11-27 — ENT-22/23 read-only service panels
Mining telemetry and Twilio owned/available number list wired into launcher (27/33 entries), authenticated through existing OIDC/Permit with explicit read permissions and private operator config. SREAD-01..03, SCFG-01..03 and RACE regression 12/12 PASS on local HTTP and deterministic external-service adapters. No write, purchase, call or SMS routes; no physical provider requests. Full build/browser/live provider and durable command execution OPEN. [Evidence](OMEGA_ENT22_23_READ_UI_2026-11-27.md).
