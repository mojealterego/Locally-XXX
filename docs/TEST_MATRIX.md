# Macierz weryfikacji

| Test | Środowisko | Wynik na 2026-11-15 | Znaczenie |
| --- | --- | --- | --- |
| `node --test tests/upstream-gate.test.mjs tests/vendorize.test.mjs` | Node.js 22, Git, Linux | **NIEPOTWIERDZONE W BIEŻĄCYM WYKONANIU** | Istnieją testy źródłowe, ale brak aktualnego zapisu ich wykonania na pełnym checkoutcie |
| `npm run vendor:apply` / `npm run vendor:check` | Syntetyczne repozytoria Git | **NIEPOTWIERDZONE W BIEŻĄCYM WYKONANIU** | Pełny import 1112 plików nadal niewykonany |
| `node --test tests/gguf-inventory.test.mjs` | Node.js 22.16.0, Linux, pliki syntetyczne | **9/9 PASS w roboczej kopii** | Nagłówek GGUF, SHA-256, symlinki, limity, CLI; nie weryfikuje rzeczywistych wag ani sprzętu |
| `node --test tests/snapshot-integrity.test.mjs` | Node.js 22.16.0, Linux, syntetyczne źródła | **7/7 PASS w roboczej kopii** | Odrzucenie podmienionych manifestów, dodatkowych plików, symlinków i obcej wersji źródeł |
| `npm run verify:source` | Świeży klon z submodułem | NIEURUCHOMIONY | Potrzebny dostęp do pełnego checkoutu źródła |
| `npm run test:unit` | Node.js 22, zależności upstream | NIEURUCHOMIONY | Pełny pakiet Vitest upstream |
| `npm run build` | Node.js 22, zależności upstream | NIEURUCHOMIONY | Build Vite/React |
| `npm run tauri:build` | Rust + toolchain OS | NIEURUCHOMIONY | Desktop binary, nie APK |
| E2E na S24 Ultra | Android + Termux + sprzęt | NIEURUCHOMIONY | Nie wolno deklarować kompatybilności urządzeniowej |

W tym wykonaniu przeprowadzono testy nowych komponentów w osobnej przestrzeni roboczej: **16/16 PASS** (9 GGUF i 7 walidacji migrowanego snapshotu), za pomocą `node --test` w środowisku Linux/Node.js 22.16.0. Testów wykonanych na świeżym checkoutcie najnowszego commita GitHub nie potwierdzono. Nie instalowano zależności upstream ani nie wykonywano buildów desktop/APK. Wynik nie dowodzi uruchomienia całej aplikacji ani pełnego OMEGA-X.

## Checkpoint migracji 2026-11-19

Porównano świeże drzewa Git przypiętego upstream oraz przygotowanego snapshotu: **1110/1110 zgodnych plików**, 2 brakujące duże zasoby graficzne dokumentacji, 0 różnic SHA/rozmiaru/trybu/typu, 0 nadmiarowych plików, 0 rozbieżności w poprzednio zapisanych plikach. Bramka integralności metadanych Git dla obecnych plików: PASS; MIG-003 jako całość: CZĘŚCIOWE. Testy aplikacji, build, pełny skan bezpieczeństwa i niezależny audyt nadal NOT_RUN/BLOCKED. Nie aktywowano workflow GitHub Actions.

## SEC-001 — 2026-11-19

`node --test tests/upstream-gate.test.mjs tests/upstream-gate-security.test.mjs`: 15/15 PASS, 0 FAIL, 0 SKIP; lokalny Linux, Node.js 22.16.0, Git 2.47.3. Pliki z poprzedniego patcha zweryfikowane SHA-256 i ponownie uruchomione; Git blob kodu `84659f81e5aba30dd145e483d05f807aec0059de`, testów `5c29a39ba103e1c058f6d043a93f61d3ab2c8e4a`. Nie jest to pełny zestaw testów aplikacji ani niezależny audyt. Odbiór w zakresie testowanej logiki zgodnie z VALIDATION_POLICY.md.

## RUN-002 — 2026-11-19

`node --test tests/staged-runtime.test.mjs`: 13/13 PASS. Regresja 3 lokalnych plików testowych SEC-001 i RUN-002: 28/28 PASS, 0 FAIL, 0 SKIP (Linux / Node.js 22.16.0). RED przed implementacją: brak modułu. Pełny zestaw testów repozytorium, rzeczywisty checkout snapshotu, pełny build i Android pozostają NOT_RUN. Dowód: `docs/evidence/RUN-002.json`.

## RUN-002 — zakotwiczenie indeksu (2026-11-19)

RED: 5/5 nowych regresji wykazało błąd; GREEN: 18/18 testów staged-runtime. Regresja 3 dostępnych plików testowych SEC-001 i RUN-002: 33/33 PASS, 0 FAIL, 0 SKIP (Linux / Node 22.16.0). Indeks 1112/1112 zgodny z przypiętym drzewem upstream; SHA-256 indeksu przypięty w kodzie. Pełny checkout, testy wszystkich sześciu plików testowych, build i Android NOT_RUN. Starszy weryfikator vendor pozostaje osobną ścieżką do utwardzenia. Dowód: `docs/evidence/RUN-002-index-anchor.json`.

## SEC-003 / CI-001 — 2026-11-19

Pełny root gate `npm run test:gate`: 68/68 PASS, 0 FAIL, 0 SKIP, exit 0. Wszystkie 6 plików testowych, 6 skryptów i package.json o zgodnych Git blob SHA z kandydatem. RED: 5 regresji indeksu, 8 snapshotu, 5 importera (każdy zestaw exit 1); GREEN: 18/18, 15/15 i 11/11. Linux x86_64 / Node v22.16.0 / Git 2.47.3. Pełny checkout aplikacji oraz build i hardware NOT_RUN. Dowód: `docs/evidence/SEC-003-CI-001.json` (SHA-256 logów w pakiecie dowodowym).
