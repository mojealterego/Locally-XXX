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
