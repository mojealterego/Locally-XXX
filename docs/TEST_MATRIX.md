# Macierz weryfikacji

| Test | Środowisko | Wynik na 2026-11-15 | Znaczenie |
| --- | --- | --- | --- |
| `node --test tests/*.test.mjs` | Node.js 22.16.0, Git 2.47.3, Linux | **13/13 PASS** | Weryfikacja zachowania bramki na syntetycznych repozytoriach |
| `npm run vendor:apply` / `npm run vendor:check` | Syntetyczne repozytoria Git | **6/6 PASS** | Kopiowanie, integralność, idempotencja i odmowa przy uszkodzeniach; nie wykonano importu pełnego upstream |
| `npm run verify:source` | Świeży klon z submodułem | NIEURUCHOMIONY | Potrzebny dostęp do pełnego checkoutu źródła |
| `npm run test:unit` | Node.js 22, zależności upstream | NIEURUCHOMIONY | Pełny pakiet Vitest upstream |
| `npm run build` | Node.js 22, zależności upstream | NIEURUCHOMIONY | Build Vite/React |
| `npm run tauri:build` | Rust + toolchain OS | NIEURUCHOMIONY | Desktop binary, nie APK |
| E2E na S24 Ultra | Android + Termux + sprzęt | NIEURUCHOMIONY | Nie wolno deklarować kompatybilności urządzeniowej |

Testy lokalne zostały wykonane bez pobierania zależności i bez połączenia z GitHub Actions. Wynik 13/13 nie dowodzi uruchomienia całej aplikacji ani pełnego OMEGA-X.
