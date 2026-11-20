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
| V4-I18N | UI, katalog, onboarding, persony PL/EN | OPEN |
| V4-ANDROID | Nazwa, zasoby PL, opcjonalne package ID oraz spójność release | OPEN |
| V4-RAG | Natywna ingestia, SQLite-vec, embedding wielojęzyczny | OPEN; PL-001 częściowo pokrywa leksykę |
| V4-VOICE | PL STT/TTS, segmentacja skrótów, zdalny voice z bramką | OPEN |
| V4-IPC | Zdarzenia postępu i telemetria zamiast pollingu | OPEN |
| V4-GPU | KV-slot handoff, kompatybilna kwantyzacja, kontekst i narzędzia | OPEN |
| V4-SEC | Izolacja procesów na poziomie OS, PL sensitive patterns | OPEN |
| V4-AST | Natywny indeks AST | OPEN |
| V4-THERMAL | Android thermal listener | OPEN |
| V4-MODELS | Lokalny katalog polskich modeli i neutralna ewaluacja PL/EN jakości | OPEN |
| V4-RELEASE | Kompilacja i testy całej aplikacji, APK | OPEN |
