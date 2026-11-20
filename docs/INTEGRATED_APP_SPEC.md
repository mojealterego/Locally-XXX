# Integrated App — normatywne rozszerzenie Locally Uncensored Enterprise

Data: 2026-11-20. Jedna aplikacja, wewnętrzne kafelki jak launcher, wspólny system zasobów, uprawnień i stanu. Natywny Android ma używać istniejącego kodu zamiast drugiego APK; desktop, PWA i WWW pozostają osobnymi targetami kompilacji wspólnego monorepo. Tryb lokalny nie jest zależny od dostępności Keycloak/Permit/Temporal; tryb Enterprise wymusza zweryfikowaną autoryzację.

## Katalog powierzchni

| Kafelek | Zakres docelowy | Wymagania |
|---|---|---|
| Chat i modele | Dual GGUF, pobieranie Hugging Face, lokalne/chmurowe API, routing i budżet KV | ENT-12 |
| Agents Studio / ODYN | Rejestr, builder, certyfikaty, ewaluacje, przydział agentów, human approval | ENT-24..28 |
| Mobile Agent | Wbudowane operacje Android, prywatne dane i kontrola uprawnień, integracja natywna | ENT-19 |
| Codespace / IDE | Repozytoria operatora, terminal, kod, AST/LSP, zdalne środowisko i CI/CD | ENT-20 |
| LLM Training Studio | Dane i licencje, SFT/LoRA/QLoRA, budżet GPU, ewaluacja jakości i bezpieczeństwa, warianty modeli i eksport GGUF | ENT-21 |
| App Builder | React Flow, typowany graf oraz AST, symulator, izolowana kompilacja | ENT-30 |
| Game Builder | Scenariusze, assety, edytor, testy gier i eksport na Android | ENT-13/30 |
| Image / Photo Studio | Generacja, profesjonalna edycja zdjęć i kontrola pamięci | ENT-12 |
| Video / Audio Studio | Generacja, montaż, STT/TTS i multimedia | ENT-12, V4-VOICE |
| Mining Control | Autoryzowane własne koparki, telemetria, temperatura/moc, kontrola zmian i audyt | ENT-22 |
| Virtual Number | Legalne numery dostawcy, połączenia i SMS, limity, koszty, autoryzacja | ENT-23 |
| Agents Market | Cennik, licencje, dokumentacja, certyfikaty, płatności i dystrybucja | ENT-27 |
| Operations | Zasoby, zdarzenia, audyt, backup, recovery, bezpieczeństwo | ENT-16/29 |

Stan każdego kafelka pochodzi z rzeczywistego capability registry, nie z deklaracji GUI. Brak integracji oznacza jawny stan niedostępny; kafelek nie może uruchamiać fikcyjnego procesu. Systemowe uprawnienia Android, operacje finansowe, zdalne sterowanie i dostęp do danych wyłącznie świadomie przyznane. Trening obejmuje legalne dane i modele, ocenę jakości/bezpieczeństwa oraz autoryzowane przypadki użycia; żadnego automatycznego znoszenia kontroli bezpieczeństwa. 
   
## Intake Android

Odczytano bez modyfikacji repozytoria:
- [Android-Agent-](https://github.com/mojealterego/Android-Agent-/tree/628ed89320b92c574983bbaedd85c6c18b32dc55): Kotlin SAF i moduły Python, kontrakty OCAF. Aktualnie odczytane drzewo nie zawiera natywnego projektu Rust.
- [ZeroAI](https://github.com/mojealterego/ZeroAI/tree/bbf422a7940bc6c5608685098b6ae28f48deadaa): Android Kotlin + Rust + UniFFI; `zeroclaw-android/Cargo.toml`, `zeroclaw-android/zeroclaw-ffi` oraz `zeroai`. README deklaruje niestandardową licencję aplikacji, Cargo workspace MIT — wymagana weryfikacja praw do każdego importowanego fragmentu. Kandydat, nie potwierdzona identyfikacja projektu przez operatora. Min SDK 28; brak dowodu na kompatybilność docelowego urządzenia, rozmiar, czas startu, build czy migrację usług.

Integracja: najpierw przypięte SHA i analiza licencji/ABI/NDK; następnie wbudowana biblioteka Rust lub most UniFFI w aktualnym Activity i jeden proces kontrolowany przez operatora. Zabezpieczyć lifecycle, IPC, Android Keystore, foreground service, SAF i kontrolę nad własnymi urządzeniami. Nie instalować osobnej aplikacji tylko dla agenta. 

## ODYN Ω / OCAF

Identyfikator OCAF-META-ODYN-001. Rust + Zenoh pozostaje natywnym rdzeniem agentów OCAF; Enterprise TS, Temporal i MCP stanowią warstwę orkiestracji/kompatybilności, a nie zastępstwo OMAs/OMAt/OSTc. Rejestr odzwierciedla identyfikatory, nazwy, numery produkcyjne/licencyjne/certyfikatów, wersje, daty, kompetencje, dokumentację, instrukcje, narzędzia, sprzęt, zależności, autonomię, testy, benchmarki, historię, status, bezpieczeństwo, ceny, licencje oraz hash integralności.

Cykl: DESIGNING → BUILDING → COMPILING → TESTING → CERTIFYING → REGISTERED → AVAILABLE → ASSIGNED → EXECUTING → LEARNING → EVOLVING. Stany awaryjne/końcowe: SUSPENDED, QUARANTINED, DEGRADED, FAILED, DEPRECATED, RETIRED. Przejścia walidowane serwerowo. Certyfikacja jest wewnętrzna; podpis, identyfikator artefaktu, dowody, metoda weryfikacji, wersja, ważność i unieważnianie. Brak zewnętrznej akredytacji.

Genesis Engine: intencja → wymagania → manifest → kod Rust → kompilacja → izolowana walidacja → poprawki w ograniczonej liczbie iteracji → akceptacja człowieka związana z hash artefaktu → rejestracja. Nie wystarczy tekstowy prompt ani wyszukanie ciągu SUCCESS. Nie interpolować niezaufanych odpowiedzi LLM w kod interpretera. Weryfikować schemat danych, rzeczywisty exit code, wersję testów, integralność i limit zasobów. Narzędzia przydzielane z przecięcia manifestu, grant operatora i PDP; brak samodzielnego rozszerzania uprawnień.

DGM/RSI: OBSERVE → DIAGNOSE → HYPOTHESIZE → DESIGN → MUTATE → SANDBOX → EVALUATE → VERIFY → PROMOTE → MONITOR. Ograniczony budżet, baseline, eksperyment, dowody, odrzucenie regresji i rollback. Academy wyłącznie w wolnych zasobach; zadania użytkownika mają pierwszeństwo. Nie wykonywać automatycznej nieautoryzowanej zmiany nadrzędnych polityk, uprawnień lub zabezpieczeń.

Harmonogram Europe/Warsaw: codzienne przeglądy autoryzowanych repozytoriów; cotygodniowe badanie potrzeb własnych, popytu, konkurencji, nisz, cen ofertowych/transakcyjnych i frontier intelligence; miesięczny OMEGA EVOLUTION PROPOSAL (badania, eksperymenty, koszty, ryzyka, migracja i rollback, kryteria); wdrożenie po akceptacji operatora. Harmonogramy są wymaganiami produktu, nie już uruchomionymi automatyzacjami.

Market: Personal/Professional/Commercial/Enterprise/OEM/Subscription/Lifetime/Custom Exclusive; brak kluczy portfeli w LLM; autoryzacja transferów i rozliczeń. Podpis integralności oraz niezależne zabezpieczenie dystrybucji, sprawdzona kryptografia symetryczna i hybrydowa PQC (ML-KEM/ML-DSA); eksperymentalna kryptografia wyłącznie z dowodami. Wewnętrzny kod nie wymaga szyfrowania dystrybucyjnego.

## Pozostałe kontrakty z przekazanej specyfikacji

- Temporal: rzeczywisty worker i activities, deterministyczny workflow, rejestracja handlera HITL przed oczekiwaniem, timeout, trwałe zatwierdzenie związane z tenantem i wersją agent manifestu; idempotentny zapis do PostgreSQL po zatwierdzeniu.
- BullMQ: parent-child flow, przydział kolejek i limity per tenant, idempotency keys, obsługa failure, kompletność wyników przed agregacją, durable output w PostgreSQL.
- Agent Registry / Approval UI: uwierzytelnione żądania, walidacja list, tablice tools, stany loading/error, anulowanie fetch, weryfikacja statusu HTTP przed aktualizacją UI, zakaz dowolnych signalName podawanych przez klienta.
- MCP search: SearXNG/Tavily/Exa, zaufane endpointy, polityka egress i klasyfikacja, ochrona przed SSRF oraz ujawnieniem informacji; stdio loguje na stderr.
- Firecracker/gVisor: prawdziwa izolacja i lifecycle, brak shell exec z interpolacją, rzeczywiste utworzenie/kill i dowód wyników; GPU tylko po potwierdzeniu kompatybilności.
- pgvector: kontynuować RLS, jawny model i wymiar embeddingu, parametryzowane SQL w transakcji z tenantem; bez globalnej nieizolowanej tabeli.
- Observability: uwierzytelnione subskrypcje per tenant, ograniczenia payload i backpressure, redakcja sekretów; trwały audyt bez deklarowania certyfikatu SOC 2.
- Multi-GPU: kontrola zarezerwowanego i wolnego VRAM, arbitraż i własność backendów, brak dowolnego backendUrl od klienta, rzeczywista integracja Ollama/LM Studio/ComfyUI.
- App Builder: React Flow, schemat węzłów i krawędzi, AST factory i printer, izolowane ścieżki projektów (nie nadpisywać współdzielonego GeneratedApp.tsx), target desktop/web/mobile/www, spawn argv z allowlist i weryfikacja artefaktów; rozmiar APK/instalatora dopiero po buildzie.
- SDK/CLI: walidacja konfiguracji, realne połączenie z gateway/MCP, bez arbitrary exec i bez wypisywania sekretów; doctor weryfikuje realny stan usług.
