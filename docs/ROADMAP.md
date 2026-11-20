# OMEGA-X / Locally-XXX — Roadmapa i rejestr stanu

Data aktualizacji: 2026-11-20. Obowiązuje [VALIDATION_POLICY v2.0](VALIDATION_POLICY.md): niedostępną infrastrukturę zastępujemy deterministycznymi testami symulacyjnymi. SIM-PASS zamyka przebadane kryterium inżynieryjne; PHYSICAL pozostaje niezależnym wymiarem. Zasada: status `POTWIERDZONE` wymaga wskazania konkretnego dowodu, `CZĘŚCIOWE` oznacza brak przynajmniej jednego kryterium odbioru, `BRAK` oznacza brak kodu/dowodu w docelowym repozytorium.

| ID | Obszar | Status | Dowód / warunek domknięcia |
| --- | --- | --- | --- |
| MIG-001 | Punkt odniesienia upstream Locally Uncensored 2.6.7 | POTWIERDZONE | Gitlink do SHA `6d96ab92...`, `.gitmodules`, `scripts/upstream-gate.mjs` |
| MIG-002 | Oryginalne autorstwo i AGPL-3.0-only | POTWIERDZONE | README, źródłowe LICENSE i package.json; zachować oznaczenia |
| MIG-003 | Niezależna pełna kopia 1112 plików upstream | CZĘŚCIOWE | 1110/1112 rzeczywistych plików w `migration/staged/locally-uncensored/`; Rust 64/64, API 224/224, UI 177/177, stores 91/91, hooks 39/39, types 11/11, lib 305/305, E2E 16/16. Zgodność Git: SHA, rozmiar i tryb. Pozostały `docs/demo.gif` i `docs/social-preview.png` (BLOCKED: interfejs nie udostępnia binarnej zawartości >1 MB). Pełny build niepotwierdzony; zewnętrzny audyt nie jest wymagany. [Raport](MIGRATION_CHECKPOINT.json) |
| MIG-004 | OMEGA-X v1–v6 / archiwa i modele | IMPLEMENTED / PARTIALLY VERIFIED | `scripts/omega_import.py`: lokalne odtworzenie z kotwicą manifestu i kontrolą SHA-256, 6/6 testów. Zweryfikowano rzeczywiste bajty 1 archiwum (7 części, 4 211 392 B); pozostałe archiwa i integracja runtime otwarte. Brak publikacji prywatnych danych. |
| SEC-001 | Bramka niezmienności źródeł | TESTOWANE LOKALNIE | `scripts/upstream-gate.mjs`, `tests/upstream-gate-security.test.mjs` — 15/15 PASS w lokalnym środowisku Node 22.16.0, Git 2.47.3, Linux; pełne testy aplikacji osobno |
| SEC-003 | Niezależna walidacja materializacji źródeł względem przypiętego indeksu | ZAIMPLEMENTOWANE / TESTOWANE LOKALNIE | `scripts/index-trust.mjs`, `scripts/snapshot-integrity.mjs`, `scripts/vendorize.mjs` — 15/15 testów snapshotu i 11/11 importera; wspólna kotwica SHA-256, ścisła kontrola manifestu i trybów, weryfikacja przed publikacją. Pełna rzeczywista materializacja pozostaje otwarta |
| SEC-002 | Skan sekretów, licencji i zależności przed publikacją | IMPLEMENTED / PARTIALLY VERIFIED | `scripts/security_scan.py`: heurystyczny skaner offline, metadane npm/Cargo, SBOM CycloneDX 1.5, 9/9 testów. Kontrola 506 wpisów npm i 681 Cargo; pełny skan/licencje/CVE pozostają otwarte. |
| RAG-001 | RAG: XLSX, polskie znaki, limity PDF/DOCX/XLSX | NAKŁADKA ZAIMPLEMENTOWANA / TESTY MODUŁU PASS | `overlays/rag/`, `npm run rag:prepare`: parser XLSX, polska tokenizacja, limity ZIP/tekst/PDF i embeddingów. Chromium 23/23 i 4 testy nakładki; 16 kotwic w 4 plikach upstream zgodnych z przypiętym SHA. Pełne uruchomienie aplikacji, test PDF.js/Mammoth w aplikacji i rzeczywisty model niezweryfikowane. |
| RUN-002 | Przygotowanie zweryfikowanego katalogu roboczego bez submodułu | TESTOWANE LOKALNIE | `scripts/staged-runtime.mjs`, 18/18 testów; zakotwiczenie SHA-256 indeksu, jawne odstępstwo tylko dla 2 zasobów dokumentacji. Porównano indeks 1112/1112 z drzewem upstream. Build i rzeczywisty snapshot lokalnie nieuruchomione. |
| RUN-001 | Desktop build Tauri/React/Rust | SIM-PASS (orkiestracja) / PHYSICAL NOT_RUN | Produkcyjny kontroler procesów `scripts/runtime_control.py`: 6/6 testów, SIM-RUN-01..03. Lokalny proces/timeout, symulowany toolchain, bezpieczny restart. Faktyczny build i binarium aplikacji niepotwierdzone. |
| AND-001 | Natywne APK Android / Termux / S24 Ultra | IMPLEMENTED PARTIAL / PHYSICAL NOT_RUN | 8 testów kontrolera + 13 brokera SQLite; rewalidacja rezerwacji podczas kafelkowania w managed GPU. SIM-AND-03 PASS dla dopuszczenia, FIFO, RAM i monitora; SIM-AND-01/02 częściowe: natywny projekt, WebView i Android lifecycle otwarte. |
| GGUF-001 | Offline inwentaryzacja GGUF i heurystyka RAM | IMPLEMENTED / TESTED (STRUKTURA) | `scripts/gguf-inventory.mjs` (9 testów) i `scripts/gguf_layout.py` (9 testów): kontrola wymiarów, bloków, offsetów, wyrównania, kolizji i granic pliku; nieznane typy odrzucane. Bez rzeczywistych wag ani inferencji. |
| GPU-001 | Lokalna inferencja GGUF / ComfyUI / 8K | IMPLEMENTED PARTIAL / PHYSICAL NOT_RUN | 9 testów adaptera + 11 recovery + 20 tiled + 16 managed GPU. Integracja CLI z brokerem, rewalidacja RAM/termiki i VRAM przed kaflem, bezpieczne PAUSED/recovery, scoped usunięcie oczekującego prompt_id. SIM-GPU-01/03 PASS; SIM-GPU-02 PARTIAL: brak bezpiecznego przerwania aktywnego zadania, restartu backendu i fizycznej telemetrii. UI otwarte. |
| CI-001 | Bezpłatna walidacja offline | TESTOWANE LOKALNIE (BRAMKI) | 72/72 Node, 107/107 Python, 23/23 Chromium — 202 unikatowe testy PASS; zgodne blob SHA. Pełny build produktu NOT_RUN; bez płatnych runnerów. |

## Kolejność domknięcia

1. Weryfikacja źródła, licencji i stanu repozytorium (`MIG-001`, `MIG-002`, `SEC-001`).
2. Import kompletnego drzewa źródeł do docelowego repo i porównanie SHA, bez uruchamiania płatnego CI (`MIG-003`).
3. Selektywny import autorskich modułów OMEGA-X po kontroli pochodzenia, licencji i sekretów (`MIG-004`, `SEC-002`).
4. Integracja RAG i testów regresyjnych; pełny build desktop (`RAG-001`, `RUN-001`).
5. Oddzielna ścieżka Android ARM64 i deterministyczna walidacja granic niedostępnej infrastruktury (`AND-001`).
6. Testy generacji i awarii z kontrolowanymi adapterami (`GPU-001`). Weryfikacja fizyczna i rzeczywiste wydanie są odrębnie rejestrowane; nie wstrzymują prac inżynieryjnych nad innymi punktami.

Brak zielonego testu w tej tabeli nie jest równoznaczny z awarią; oznacza brak potwierdzonego dowodu w docelowym repozytorium.
