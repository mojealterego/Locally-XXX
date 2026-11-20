# Enterprise Architecture Increment — 2026-11-20

Źródło wymagań: kolejna specyfikacja architektury, kodu IDE, optymalizacji kontekstu, DR, konfiguracji Tauri i CI/CD przekazana przez operatora. Niniejszy dokument uzupełnia ENTERPRISE_ROADMAP.md i INTEGRATED_APP_SPEC.md; nie zastępuje dowodów implementacji. Tryb local-first nadal działa niezależnie od chmury.

## Macierz kontraktów i odbioru

| ID istniejący | Dodatkowe wymaganie | Obowiązkowy dowód |
|---|---|---|
| ENT-01/14 | React 19 SPA/PWA i Rust/Tauri, separacja usług, protokół API gRPC lub GraphQL po ADR; lokalny tryb offline zachowuje lokalny stan | API kontrakty, testy desktop/mobile/web i synchronizacji po odzyskaniu sieci |
| ENT-02/24/28 | Rejestr agentów, wyszukiwanie/filtrowanie, kompetencje, modele, narzędzia, metryki, certyfikaty, interakcja chat | Izolacja tenantów, autoryzacja każdego odczytu i uruchomienia, wersjonowanie manifestu |
| ENT-08/09 | HTTP 202 z trwałym ID; Temporal i BullMQ; human approval związany z wersją artefaktu; ścisłe limity, retry/recovery, odtwarzanie stanu | Crash/replay, idempotencja side effects, awaria po commit przed enqueue, timeout, odrzucenie i anulowanie |
| ENT-10/11 | Tavily/Exa/SearXNG/Serper, kontrola livecrawl, klasyfikacja danych; Firecracker CPU/gVisor, izolowany workspace | test egress/SSRF, brak wycieku sekretów, niezaufany kod, limity zasobów i zniszczenie sandboxu |
| ENT-13/20 | Własny Agent-Native IDE: eksplorator, edytor, AST/LSP, terminal, logi agenta, preview, bez obowiązkowej zewnętrznej wtyczki VS Code | izolacja workspace, path traversal/symlinks, optimistic concurrency, aktualny plik, poprawność AST i rollback |
| ENT-15 | Gradientowa kompresja promptów, zachowanie źródeł, systemu i najnowszych interakcji, pomiar tokenów | rzeczywisty tokenizer modelu, chat template, limit budżetu, jakość streszczeń, test rozbieżności i przepełnienia |
| ENT-16 | Przyrostowa synchronizacja IndexedDB/SQLite i efemerycznych workspace do PostgreSQL/S3, backup lokalny, 30 s cel checkpointu | atomowy zapis, szyfrowanie, restore, konflikt rewizji, awaria podczas backupu, RPO/RTO zmierzone |
| ENT-17/30 | Multi-target packager: Windows/Linux/macOS/Android/iOS/web/PWA/www, lockfile, podpisy, artefakty, SBOM | realne buildy, weryfikacja podpisów odpowiednich dla platformy; ręcznie autoryzowane CI |
| ENT-29 | SSE/WebSocket streaming tokenów, audyt i obserwowalne etapy zadań, cytowania RAG | autoryzacja per tenant, replay/resume, backpressure, rozłączenie, redakcja sekretów, poprawność identyfikatorów źródeł |

## ENT-15: model budżetu kontekstu

W specyfikacji operatora: T_total = T_system + T_recent + sum(w_i * T_segment_i), w_i od 0.1 do 1.0; starsze segmenty mają silniejszą kompresję. Docelowa implementacja powinna odróżniać planowane i rzeczywiste liczby tokenów. Dla wieku a_i >= 0 i lambda > 0 proponowany model w_i = 0.1 + 0.9 * exp(-lambda * a_i). Budżet segmentu to floor(w_i * T_segment_i), następnie ograniczany pozostałym budżetem przez scheduler.

T_input_real + T_output_reserved + T_template_overhead <= T_model_limit. Liczyć na finalnym renderowanym prompt z tokenizerem tego samego modelu, bez heurystyki znak/4 i bez mylenia słów z tokenami. Narzut chat template nie może być liczony podwójnie. Ostatnie cztery wiadomości (konfigurowalne), bieżący stan kodu, chronione instrukcje i krytyczne odwołania do źródeł pozostają w pełnej postaci. Jeśli chroniony kontekst nie mieści się w budżecie, jawny błąd lub kontrolowana zmiana modelu po zgodzie; brak cichego usunięcia chronionych danych.

Streszczenie nie jest nadrzędną instrukcją użytkownika. Zachować source IDs, hash oryginału, model/tokenizer version, budżet i rzeczywiste rozmiary; oryginały w RAG/archiwum dostępne do ponownego odczytu. Wyjście modelu streszczającego ponownie tokenizować; limit ponowień i walidacja. Raportować faktyczną redukcję oraz recall krytycznych faktów i cytowań, nie deklarować 80–90% jakości/VRAM bez dowodu. Kontrola KV-cache i VRAM wymaga oddzielnych pomiarów.

## ENT-13/30: IDE i bezpieczny symulator

Wewnątrz Integrated App trzy panele: eksplorator plików i obserwowalne logi agenta, edytor kodu z wersjonowaniem, symulator responsywny. Predefiniowane rozmiary urządzeń i tryby orientacji. Skala = min(1, availableWidth/deviceWidth, availableHeight/deviceHeight), layout rezerwuje width*scale i height*scale. Obsługa ResizeObserver i Pointer Events; iframe sandbox bez połączenia allow-scripts z allow-same-origin dla niezaufanego same-origin kodu, osobny origin, restrykcyjny CSP i brak dostępu do tokenów aplikacji nadrzędnej. Podgląd nie jest emulatorem natywnych API systemowych.

Kontroler repozytoriów: identyfikator projektu z zaufanego rejestru, relative path allowlist, canonical root boundary i symlink/hardlink/TOCTOU threat model, limity pliku, read-revision/hash CAS, izolowany build i atomowy zapis. AST parser + diagnostyka i walidacja patcha, nie ślepy zapis tekstu LLM. Nie kopiować przykładowej kontroli startsWith(projectPath). Agent może proponować poprawki; bramki bezpieczeństwa i uprawnienia operatora są obowiązkowe.

## ENT-16: recovery i spójność

30 s to cel RPO lokalnej pracy przy zdrowym środowisku, nie gwarancja. Checkpoint ręczny, lifecycle/close, okresowy; beforeunload jest best effort. WAL/outbox z monotoniczną rewizją, tenant/project/device, hash, idempotentnym kluczem, append-only manifestami i kontrolą konfliktu; atomowy zapis temp + fsync + rename. Backup lokalny w katalogu prywatnym OS, szyfrowany; klucze z OS Keystore/KMS poza LLM. Brak ślepego odtwarzania całej historii do globalnej tabeli agent_memories. Wektory wymiar/model zgodny z docelową bazą. PostgreSQL PITR/WAL i S3 versioning jako odrębne mechanizmy, odtwarzanie do kontrolowanego środowiska, checksumy i testy crash. Brak niejawnego usuwania danych. Replication lag i RPO/RTO z rzeczywistych pomiarów.

## ENT-17: release

Weryfikacja zależności przypiętych do lockfile, hermetyczne buildy platformowe, SHA-256/SBOM/provenance, wyłącznie autoryzowana publikacja. Tauri updater signing (Ed25519/minisign) nie jest podpisem Authenticode/EV i nie gwarantuje braku ostrzeżeń SmartScreen; Windows wymaga właściwego code signing, macOS Developer ID/notarization, Android podpisu APK/AAB, iOS profili i podpisów platformowych, Linux zależnie od kanału dystrybucji. Single-instance przez kompatybilny plugin Tauri, CSP w prawidłowym polu app.security i minimalne capabilities; nie kopiować błędnych pól bundle.security/singleInstance z przykładu. Zakaz automatycznego płatnego CI: workflow przygotowywać oddzielnie, wyłącznie ręczna autoryzacja uruchomienia, bez automatycznego tagowania/push wydania. Nie deklarować rozmiaru 15 MB bez artefaktu. 

## ENT-08/09/29: obserwowalność i bezpieczeństwo

Temporal wznawia logiczny workflow przez replay zdarzeń; zewnętrzne Activities mogą być wykonane ponownie. Nie gwarantować wznowienia w dowolnej instrukcji procesu ani exactly-once zewnętrznego efektu bez idempotencji/fencing. Durable approval obecnie DB CAS; sygnał w przyszłości ma budzić workflow, a źródłem prawdy pozostaje zweryfikowana decyzja i digest. Nie wysyłać poświadczeń do historii Temporal/Redis. Osobne polityki narzędzi i egress przy każdym wykonaniu.

Thinking Mode: prezentować obserwowalne etapy, zwięzłe uzasadnienia decyzji, przebieg narzędzi, dowody i cytowania, nie wymuszać ujawniania prywatnego rozumowania modeli. Zdarzenia tylko per tenant z autoryzowaną subskrypcją, limity i redakcja. Wyszukiwarki nie gwarantują ochrony przed prompt injection; zewnętrzne wyniki pozostają niezaufanymi danymi, SearXNG nie gwarantuje sam w sobie zero data retention u operatorów silników nadrzędnych.

Stan: wymagania normatywne, OPEN poza implementacją udokumentowaną osobno; żadna kompilacja produktu ani wdrożenie nie jest tutaj deklarowane.
