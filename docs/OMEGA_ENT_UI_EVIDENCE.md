# ENT-13 / ENT-14 / ENT-18 — Integrated App web increment
Baza main: f76c9dd55cbdf2d47636cfe2152589706a5c286d. Node v22.16.0, TypeScript 5.8.3 (globalna instalacja), Linux. Kod addytywny, bez zmiany pinned upstream i bez płatnego CI. Pierwszy shell wykorzystuje natywny DOM/ES modules zamiast React 19, ponieważ nie było dostępnych zależności React ani pnpm. To rzeczywista statyczna aplikacja webowa, nie APK ani pełna SPA React/PWA. Nie instalowano nowych zależności. Brak lockfile.

## ENT-13
Workspace: oddzielne pliki in-memory, do 64 plików, 256 KiB per file, 2 MiB total, walidacja relative path i CAS revision. Brak zapisu do filesystem hosta; import i eksport file picker/download w UI, bez automatycznego persystowania po zamknięciu. Podgląd statycznego HTML przez allowlisted elementy bez atrybutów/skryptów, iframe sandbox bez uprawnień, CSP, 4 presety viewport i dwuwymiarowa skala. Nie jest to emulator natywnych API ani uruchamianie dowolnego React/JS; wizualne działanie niezweryfikowane w tej sesji. TS AST inspector w CLI korzysta z TypeScript Compiler API do import/export module specifiers, wybranych deklaracji i syntaktycznych diagnostyk transpileModule. Nie pełny type checker, LSP, kompilator grafów UI ani agent edytujący repozytorium. 

## ENT-14
ReviewClient: subpath @omega/agent-sdk/reviews z deklaracją typów, stałe POST get/submit/decide, walidacja UUID/digest/status/manifest, Bearer, HTTPS poza loopback, redirect:error, timeout fetch 10s, odpowiedź max 1 MiB. Token z zaufanego callbacku. Server-side OIDC/PDP pozostaje autorytetem, klient nie weryfikuje samodzielnie tenanta. CLI inspect oraz review-get/review-submit/review-decide, token z env, bez arbitralnego shell; CLI testowany fizycznie dla inspect, nie dla wszystkich poleceń review. Manifesty workspace zachowują graph exports i dodają reviews. Testowana deklaracja TS. Web serve: loopback, allowlist plików i 3 endpointów proxy, upstream wyłącznie skonfigurowany lokalny port, kontrola Origin i Bearer, body 16 KiB, limit odpowiedzi i połączeń. Nie publiczny reverse proxy, nie pełna ochrona przed przejęciem hosta. Backend w teście deterministyczny serwer HTTP, nie rzeczywisty Temporal/Keycloak/Permit. 

## ENT-18
18 nazwanych kafelków PL/EN. Dostępne interfejsy: IDE, przeglądy agentów, ustawienia; pozostałe jawnie disabled. Dostępność oznacza obecność UI, nie health probe działającego backendu. Ekran przeglądów pobiera projekt po UUID i wymaga potwierdzenia decyzji powiązanej z digest; nie tworzy ani nie wdraża agenta. Token OIDC w pamięci pola hasłowego, czyszczony przy zmianie widoku, bez localStorage. Brak pełnego PKCE, rejestru agentów, SSE, zdalnego IDE, systemowej persystencji, natywnych adapterów i service worker. Ustawienia zawierają tylko wybór języka i informację o trybie lokalnym.

## Weryfikacja
RED: node --test test/ui.test.mjs exit 1 (brak modułów), SHA256 f6bed1ab34cd2b8a4a56b4e0e0618ed485a39240d8ad002ff388c8e8cccc1eaa.
GREEN: npm run test:ui — 9/9 PASS, 0 FAIL/SKIP/CANCEL; SHA256 f9ac86b97c2a9597fba60fccf01fc33732a66d50f2f5c0f67246970f82873b82. Dwa dodatkowe testy CLI i HTTP po pierwszych siedmiu; brak osobnej RED dla tych dwóch.
- SDK real HTTP, nieprawidłowa odpowiedź/cleartext, fixed approval endpoint.
- Workspace CAS/path traversal, viewport scale, capability registry, rzeczywiste TS AST.
- CLI subprocess i exit status, web build + serwowanie wszystkich assetów, odrzucenie obcego Origin i nieznanych ścieżek, rzeczywisty lokalny proxy HTTP.
- tsc --noEmit --strict --target ES2022 --module nodenext --moduleResolution nodenext --lib ES2022,DOM test/sdk-types.mts — exit 0.
- node --check na modułach .mjs — exit 0.
- Chromium/Playwright próba browser E2E: BLOCKED, net::ERR_BLOCKED_BY_ADMINISTRATOR dla loopback. Nie zmieniano polityki przeglądarki. Nie wykonano testu renderowania ani pełnego UI E2E. Nie testowano fizycznego Androida, desktop/Tauri, PWA ani poprzednich suite backendu, pnpm install i pełnego monorepo.

SHA Git lokalnych plików źródłowych:
app.mjs 2afbf093508ec6d6606c5fb30f83c9e74c221f39
build.mjs bb2d1229c8309933b246f787b5cf286c78cc136a
index.html 37e6331309d9d013d2e11047b5436f13575952e3
style.css e41b7644c8f35a5a012dc856da69f60cb279865f
serve.mjs 3defb47d07acb806e7153bd026a7c9233b38ed34
workspace.mjs 81f727a2bfa5c77425e203a880437234c2304e05
inspect.mjs 478058e86176e8c8c65209ab1a239181cc405370
review-client.mjs 226fb07c2640995928479125f80f64caaef4afbe
review-client.d.mts c4ae95e35c2456a0d8518e87280642c029ce7ed0
cli.mjs e04b1b0fb200a3d09926246189ad559ded0bfe24
catalog.mjs d8142fc5ef6e401e03bb74c684f43fb0a0abe3ec
ui.test.mjs 23d34d382bc1ab5b888b75f33f0ef5ff7992e621
sdk-types.mts add8fdbc32e0fbb804c7685a55fff5ba58630dfe
GATE-04 PASS dla wykonanego zestawu; ENT-13/14/18 PARTIAL, pełny GATE-09 niezaliczony.
