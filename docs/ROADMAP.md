# OMEGA-X / Locally-XXX — Roadmapa i rejestr stanu

Data inwentaryzacji: 2026-11-15. Zasada: status `POTWIERDZONE` wymaga wskazania konkretnego dowodu, `CZĘŚCIOWE` oznacza brak przynajmniej jednego kryterium odbioru, `BRAK` oznacza brak kodu/dowodu w docelowym repozytorium.

| ID | Obszar | Status | Dowód / warunek domknięcia |
| --- | --- | --- | --- |
| MIG-001 | Punkt odniesienia upstream Locally Uncensored 2.6.7 | POTWIERDZONE | Gitlink do SHA `6d96ab92...`, `.gitmodules`, `scripts/upstream-gate.mjs` |
| MIG-002 | Oryginalne autorstwo i AGPL-3.0-only | POTWIERDZONE | README, źródłowe LICENSE i package.json; zachować oznaczenia |
| MIG-003 | Niezależna pełna kopia 1112 plików upstream | CZĘŚCIOWE | Submoduł i przetestowany importer `vendorize.mjs`; nie ma jeszcze kompletu obiektów w drzewie Locally-XXX; wykonać import i sprawdzić SHA |
| MIG-004 | OMEGA-X v1–v6 / archiwa i modele | CZĘŚCIOWE | Istnieją artefakty w innym repo; w tym publicznym nie skopiowano ani nie zweryfikowano wszystkich bajtów |
| SEC-001 | Bramka niezmienności źródeł | POTWIERDZONE LOKALNIE | `npm run test:gate` (13 testów jednostkowych na syntetycznych repozytoriach) |
| SEC-002 | Skan sekretów, licencji i zależności przed publikacją | BRAK | Skan pełnej zawartości i raport SBOM; prywatnych archiwów nie publikować bez przeglądu |
| RAG-001 | RAG: XLSX, polskie znaki, limity PDF/DOCX/XLSX | BRAK W REPO | Wcześniejsze prace wymagają porównania z kodem i odtworzenia regresji w Locally-XXX |
| RUN-001 | Desktop build Tauri/React/Rust | NIEZWERYFIKOWANE | `npm ci`, `npm run build`, `cargo test` i test uruchomienia na docelowym OS |
| AND-001 | Natywne APK Android / Termux / S24 Ultra | BRAK | Pełny toolchain, binaria ARM64, podpis, instalacja, logcat, E2E na urządzeniu |
| GPU-001 | Lokalna inferencja GGUF / ComfyUI / 8K | NIEZWERYFIKOWANE | Pomiary sprzętowe, integralność wag i odrębne testy każdej ścieżki |
| CI-001 | Bezpłatna walidacja offline | CZĘŚCIOWE | `node --test` lokalnie; bez automatycznego uruchamiania płatnych runnerów |

## Kolejność domknięcia

1. Weryfikacja źródła, licencji i stanu repozytorium (`MIG-001`, `MIG-002`, `SEC-001`).
2. Import kompletnego drzewa źródeł do docelowego repo i porównanie SHA, bez uruchamiania płatnego CI (`MIG-003`).
3. Selektywny import autorskich modułów OMEGA-X po kontroli pochodzenia, licencji i sekretów (`MIG-004`, `SEC-002`).
4. Integracja RAG i testów regresyjnych; pełny build desktop (`RAG-001`, `RUN-001`).
5. Oddzielna ścieżka Android ARM64 i walidacja na urządzeniu (`AND-001`).
6. Dopiero po przejściu bramek sprzętowych: testy generacji i wydanie (`GPU-001`).

Brak zielonego testu w tej tabeli nie jest równoznaczny z awarią; oznacza brak potwierdzonego dowodu w docelowym repozytorium.
