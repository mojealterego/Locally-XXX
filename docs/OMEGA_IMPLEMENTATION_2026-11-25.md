# OMEGA / Locally-XXX — przyrost implementacyjny 2026-11-25

Repozytorium: `mojealterego/Locally-XXX`, gałąź wyłącznie `main`.
Zakres: integracja dostępu do weryfikowanego źródła runtime oraz pierwsza rzeczywista ścieżka OMEGA Developer Suite (Node.js, local UI, HTTP i MCP). Nie uruchamiano buildów zgodnie z decyzją operatora.

## RUN-001 — etap implementacyjny, nie odbiór builda

- `scripts/runtime-entry.mjs` kieruje działania `verify/dev/build/lint/test:unit/test:e2e/tauri:build` do przypiętego podmodułu lub przygotowanego snapshotu staging.
- Snapshot jest sprawdzany przez istniejące `prepareStage` z kontrolą integralności indeksu i bajtów. W razie istnienia nieprawidłowego, niepustego checkoutu tryb `auto` odrzuca wykonanie zamiast ukrywać naruszenie.
- Operator może wybrać `OMEGA_SOURCE_MODE=auto|submodule|staged`. Brak dwóch dużych zasobów dokumentacyjnych można dopuścić wyłącznie jawnie przez `OMEGA_ALLOW_MISSING_DOC_ASSETS=YES`, bez wyłączania kontroli plików źródłowych.
- Zmiany `package.json` przełączają siedem akcji aplikacji na nowy selektor. **Faktyczny npm, Cargo, Tauri i APK: NOT_RUN**. Nie ma dowodu, że pełne źródła i zależności są kompletne do kompilacji.

## DEV-001–012 — rzeczywisty przyrost

- `scripts/devsuite-core.mjs`: JSON format, Base64 UTF-8 encode/decode, inspekcja JWT bez weryfikacji podpisu, SHA-256/512 (oraz legacy MD5/SHA-1), kryptograficzne hasła, UUIDv4.
- `locally-uncensored-enterprise/apps/web/devsuite-service.mjs`: jawna biała lista 7 operacji, walidacja pól, rozmiarów i parametrów, brak shell/network/dynamic execute.
- `devsuite-http.mjs` + `serve.mjs`: wyłącznie loopback, same-origin, nagłówek niestandardowy, limit 64 KiB, `Cache-Control: no-store`, bez trwałego przechowywania tokenów.
- `devsuite-browser.mjs` + launcher: polsko-angielski ekran narzędzi, wyniki w bezpiecznym `textContent`, możliwość kopiowania.
- `integrations/bin/devsuite-mcp.mjs`: STDIO JSON-RPC 2.0, tools/list, tools/call, initialize/ping, granica 64 KiB/wiersz, brak egress. Zgłoszony protokół `2025-11-25`; zgodność z zewnętrznymi klientami MCP nie została jeszcze potwierdzona testem interoperacyjności.

## Wykonane testy lokalne (bez builda)

Środowisko: Linux x86_64, Node.js 22.16.0; izolowana kopia modułów przygotowana lokalnie. Sekwencja komend:
- `node --test locally-uncensored-enterprise/test/devsuite-service.test.mjs` — 5/5 PASS.
- `node --test locally-uncensored-enterprise/test/devsuite-http.test.mjs` — 3/3 PASS, rzeczywiste HTTP loopback.
- `node --test locally-uncensored-enterprise/integrations/test/devsuite-mcp.test.mjs` — 5/5 PASS, obsługa STDIO w pamięci.
- `node --test tests/runtime-entry.test.mjs` — 5/5 PASS, kontrakty routingu z wstrzykniętym runnerem; **nie** rzeczywisty build.

Łącznie: **18/18 PASS w wymienionych izolowanych testach**. Weryfikacja pełnego checkoutu i globalnej regresji nie była wykonywana. Test `runtime-entry` stosuje adapter kontrolowany, a nie faktyczną materializację staging. Dodatkowe testy `tests/devsuite-core.test.mjs` istnieją w repo, ale nie są ujęte w powyższej liczbie.

## Rozdzielenie statusów

| Zakres | Faktyczny stan |
| --- | --- |
| RUN-001 | source selection IMPLEMENTED; physical build NOT_RUN; global BLOCKED |
| DEV-001 | funkcjonalny rdzeń Node, docelowy Rust core OPEN |
| DEV-002–003 | 7 używalnych operacji lokalnych, katalog 200+ OPEN |
| DEV-004–005 | network i pełne security suites OPEN |
| DEV-006 | działający serwer MCP dla 7 narzędzi; pełna integracja Agent Gateway OPEN |
| DEV-007–008 | narzędzia GGUF i natywne Android OPEN |
| DEV-009–010 | ekran PL/EN IMPLEMENTED częściowo; favourites/history OPEN |
| DEV-011–012 | 200+ narzędzi i pełne bramki odbiorowe OPEN |
| Ω-INT-001–005, AND-001, ENT-52–54, V4-RAG, V4-VOICE, V4-AST, V4-MODELS, V4-RELEASE | wcześniejszy zakres wciąż częściowy/otwarty; niezaliczony tym przyrostem |

Żadnego GATE-09 nie oznaczono PASS. Nie utworzono gałęzi innych niż `main`, nie wykonano publikacji ani płatnych operacji.
