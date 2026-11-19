# OMEGA-X / Locally-XXX — Roadmapa i rejestr stanu

Data aktualizacji: 2026-11-19. Zasada: status `POTWIERDZONE` wymaga wskazania konkretnego dowodu, `CZĘŚCIOWE` oznacza brak przynajmniej jednego kryterium odbioru, `BRAK` oznacza brak kodu/dowodu w docelowym repozytorium.

| ID | Obszar | Status | Dowód / warunek domknięcia |
| --- | --- | --- | --- |
| MIG-001 | Punkt odniesienia upstream Locally Uncensored 2.6.7 | POTWIERDZONE | Gitlink do SHA `6d96ab92...`, `.gitmodules`, `scripts/upstream-gate.mjs` |
| MIG-002 | Oryginalne autorstwo i AGPL-3.0-only | POTWIERDZONE | README, źródłowe LICENSE i package.json; zachować oznaczenia |
| MIG-003 | Niezależna pełna kopia 1112 plików upstream | CZĘŚCIOWE | 1110/1112 rzeczywistych plików w `migration/staged/locally-uncensored/`; Rust 64/64, API 224/224, UI 177/177, stores 91/91, hooks 39/39, types 11/11, lib 305/305, E2E 16/16. Zgodność Git: SHA, rozmiar i tryb. Pozostały `docs/demo.gif` i `docs/social-preview.png` (BLOCKED: interfejs nie udostępnia binarnej zawartości >1 MB). Build i niezależny audyt nadal niepotwierdzone. [Raport](MIGRATION_CHECKPOINT.json) |
| MIG-004 | OMEGA-X v1–v6 / archiwa i modele | CZĘŚCIOWE | Istnieją artefakty w innym repo; w tym publicznym nie skopiowano ani nie zweryfikowano wszystkich bajtów |
| SEC-001 | Bramka niezmienności źródeł | TESTOWANE LOKALNIE | `scripts/upstream-gate.mjs`, `tests/upstream-gate-security.test.mjs` — 15/15 PASS w lokalnym środowisku Node 22.16.0, Git 2.47.3, Linux; pełne testy aplikacji osobno |
| SEC-003 | Niezależna walidacja materializacji źródeł względem przypiętego indeksu | ZAIMPLEMENTOWANE / TESTOWANE LOKALNIE | `scripts/index-trust.mjs`, `scripts/snapshot-integrity.mjs`, `scripts/vendorize.mjs` — 15/15 testów snapshotu i 11/11 importera; wspólna kotwica SHA-256, ścisła kontrola manifestu i trybów, weryfikacja przed publikacją. Pełna rzeczywista materializacja pozostaje otwarta |
| SEC-002 | Skan sekretów, licencji i zależności przed publikacją | BRAK | Skan pełnej zawartości i raport SBOM; prywatnych archiwów nie publikować bez przeglądu |
| RAG-001 | RAG: XLSX, polskie znaki, limity PDF/DOCX/XLSX | NAKŁADKA ZAIMPLEMENTOWANA / TESTY MODUŁU PASS | `overlays/rag/`, `npm run rag:prepare`: parser XLSX, polska tokenizacja, limity ZIP/tekst/PDF i embeddingów. Chromium 23/23 i 4 testy nakładki; 16 kotwic w 4 plikach upstream zgodnych z przypiętym SHA. Pełne uruchomienie aplikacji, test PDF.js/Mammoth w aplikacji i rzeczywisty model niezweryfikowane. |
| RUN-002 | Przygotowanie zweryfikowanego katalogu roboczego bez submodułu | TESTOWANE LOKALNIE | `scripts/staged-runtime.mjs`, 18/18 testów; zakotwiczenie SHA-256 indeksu, jawne odstępstwo tylko dla 2 zasobów dokumentacji. Porównano indeks 1112/1112 z drzewem upstream. Build i rzeczywisty snapshot lokalnie nieuruchomione. |
| RUN-001 | Desktop build Tauri/React/Rust | NIEZWERYFIKOWANE | `npm ci`, `npm run build`, `cargo test` i test uruchomienia na docelowym OS |
| AND-001 | Natywne APK Android / Termux / S24 Ultra | BRAK | Pełny toolchain, binaria ARM64, podpis, instalacja, logcat, E2E na urządzeniu |
| GGUF-001 | Offline inwentaryzacja GGUF i heurystyka RAM | ZAIMPLEMENTOWANE / TESTOWANE LOKALNIE | `scripts/gguf-inventory.mjs` + 9 testów; bez testu sprzętowego i bez pełnej walidacji tensorów |
| GPU-001 | Lokalna inferencja GGUF / ComfyUI / 8K | NIEZWERYFIKOWANE | Pomiary sprzętowe, integralność wag i odrębne testy każdej ścieżki |
| CI-001 | Bezpłatna walidacja offline | TESTOWANE LOKALNIE (BRAMKI) | `npm run test:gate`: 72/72 PASS na wszystkich 7 plikach testowych z identycznymi blob SHA. Pełne testy aplikacji i build nadal NOT_RUN; bez płatnych runnerów. |

## Kolejność domknięcia

1. Weryfikacja źródła, licencji i stanu repozytorium (`MIG-001`, `MIG-002`, `SEC-001`).
2. Import kompletnego drzewa źródeł do docelowego repo i porównanie SHA, bez uruchamiania płatnego CI (`MIG-003`).
3. Selektywny import autorskich modułów OMEGA-X po kontroli pochodzenia, licencji i sekretów (`MIG-004`, `SEC-002`).
4. Integracja RAG i testów regresyjnych; pełny build desktop (`RAG-001`, `RUN-001`).
5. Oddzielna ścieżka Android ARM64 i walidacja na urządzeniu (`AND-001`).
6. Dopiero po przejściu bramek sprzętowych: testy generacji i wydanie (`GPU-001`).

Brak zielonego testu w tej tabeli nie jest równoznaczny z awarią; oznacza brak potwierdzonego dowodu w docelowym repozytorium.
