# Integrated App Ω — lokalny web shell

Z katalogu locally-uncensored-enterprise, Node >=22:

```sh
npm run build:web
npm run start:web
```

Otwórz http://127.0.0.1:4173 na tym samym urządzeniu. Build nie wymaga dostępu do sieci. Domyślny WEB_PORT 4173, REVIEW_PORT 3001; serwer wyłącznie loopback. Nie wystawiać serwera do publicznej sieci. IDE i settings działają bez klastra. Edycja w pamięci sesji, eksportuj przed zamknięciem. Preview ograniczony do bezpiecznego statycznego HTML; nie uruchamia JS/TS.

Przeglądy agentów wymagają osobno uruchomionego backend start:reviews, poprawnego tokenu OIDC i polityki Permit. UI nie wykonuje logowania ani nie wdraża agenta. Wpisanie tokenu z klawiatury tylko w zaufanym środowisku; nie zapisywać tokenów w plikach. Nie uruchamiano prawdziwego klastra.

CLI (po instalacji TypeScript 5.8.3 w workspace dla inspect):
```sh
node packages/cli-tool/cli.mjs inspect ścieżka.ts
node packages/cli-tool/cli.mjs review-get UUID
node packages/cli-tool/cli.mjs review-submit draft.json
node packages/cli-tool/cli.mjs review-decide UUID DIGEST approve
```
Dla review ustaw OMEGA_REVIEW_URL na zaufany origin backendu i OMEGA_REVIEW_TOKEN w zmiennej środowiskowej bez wypisywania w historii poleceń; po użyciu usuń zmienną. SDK @omega/agent-sdk/reviews po instalacji workspace. Testy: npm run test:ui (wymaga TypeScript w ide-studio); opcjonalny compile-only test deklaracji w test/sdk-types.mts. Pełne pnpm install i testy wszystkich pakietów pozostają niewykonane.

33 kafelki, 18 dostępnych interfejsów i 15 nadal niedostępnych (stan modułów z 2026-11-25). Nie jest to gotowy APK/PWA ani pełny React 19 IDE. Szczegóły: docs/OMEGA_ENT_UI_EVIDENCE.md w głównym repozytorium.

## Visual Builder i lokalny Codespace
Kafelek App Builder: formularz ekranów, tekstów, nagłówków i przycisków, podgląd DOM bez wykonywania kodu; eksport grafu JSON. Kompilacja AST po stronie narzędzia lokalnego: `node ide-studio/compile-app.mjs graph.json` zwraca JSON z poprawnym React/TypeScript i sumą SHA-256. Nie kompiluje jeszcze Android/iOS/desktop ani nie instaluje React Flow.

Codespace (operator wybiera istniejące lokalne repo Git; tylko do odczytu, przypięty SHA): `node ide-studio/codespace-cli.mjs list /path/to/repo <commit-sha>`; `read /path/to/repo <commit-sha> src/App.tsx`; `bundle /path/to/repo <commit-sha> > project.omega.json`. W IDE importuj `.omega.json`; sprawdzane są SHA-256 każdego pliku, identyfikatory i limity. Import zamienia istniejącą sesję tylko po potwierdzeniu; pliki nie są automatycznie zapisywane do oryginalnego repozytorium. Kod źródłowy repo nie jest wykonywany. Nie jest to hostowany GitHub Codespace ani wirtualny terminal, ewentualne przyszłe wykonywanie tylko przez odrębny sandbox.

## External Integrations (ENT-37..40)
Cztery kafelki: File Converter (lokalny canvas JPG/PNG/WebP bez sieci), JSON Formatter (pretty/minify/YAML/ENV), LLM Knowledge (przypięty snapshot README z wyszukiwaniem po wierszach), Rate Calculator (lokalne oszacowanie stawki). PDF, HEIC i SVG są **jawnie nieobsługiwane** przez ten etap; ich dekodery wymagają odrębnego audytu, licencji i izolacji. UI nie wywołuje automatycznie zewnętrznych usług.

Pełny dokument: [integrations README](../../integrations/README.md) i [dowody repo](../../../../docs/OMEGA_ENT_EXTERNAL_INTEGRATIONS.md). Knowledge MCP i RAG po stronie serwera opisane są w osobnym przewodniku.

## Katalog i symulator — ENT-41/42
Launcher ma wyszukiwanie live po nazwie modułu oraz filtrowanie dostępne/planowane bez odblokowywania funkcji niezaimplementowanych. Silnik `integrations/src/catalog-index.mjs` może zostać ponownie użyty przez Model Manager i Agent Registry po zasileniu z autoryzowanych serwerowych rekordów; żadne dane wielu tenantów nie są obecnie pobierane w tych widokach.

Viewport w IDE korzysta teraz z jednego obliczenia dla obu osi (`viewportLayout`): `scale=min(1, availableWidth/deviceWidth, availableHeight/deviceHeight)`. Szerokość i wysokość zewnętrznej obudowy równa się odpowiedniemu wymiarowi pomnożonemu przez skalę; sam iframe zachowuje logiczny rozmiar urządzenia i transform CSS. Rzeczywisty browser E2E i natywne symulatory urządzeń nie były uruchamiane.

## Cloud gateway — on-demand
Kafelek Cloud Gateway jest interfejsem połączenia z lokalnym proxy, nie dowodem uruchomienia dostawcy. API key wpisany w formularzu jest wysyłany wyłącznie do lokalnego endpointu po OIDC i PDP. Backend zapisuje zaszyfrowany klucz w odseparowanym katalogu i nie zwraca go klientowi. Funkcja transmisji pozostaje zablokowana, dopóki operator nie ustawi `OMEGA_CLOUD_ENABLED=YES`, nie skonfiguruje OIDC/PDP/vault oraz nie potwierdzi konkretnej publicznej wiadomości. Ruch chmurowy może być płatny. Nie kopiować RAG ani treści konwersacji automatycznie. Szczegóły: `backend/CLOUD_GATEWAY.md`.

## Awesome Workspace ENT-47/48/49
Kafelek **Awesome Enterprise** pokazuje 10 ujednoliconych nazw i faktyczny zakres dostępnych kodów. PARTIAL oznacza tylko częściową implementację; nie ma automatycznego wdrożenia ani nowych uprawnień. Moduły CLI: lokalny benchmark Ollama (wyłącznie jawne `--execute YES`) oraz raporty HTML/PDF z Unicode. [Instrukcja](../../README_AWESOME.md) · [dowody](../../../../docs/OMEGA_ENT_AWESOME_EVIDENCE.md). PDF działa w środowisku posiadającym ReportLab i lokalny font TTF, nie przesyła materiałów do chmury. Funkcje benchmarku i eksportu PDF nie mają jeszcze interfejsów webowych.

## Developer Suite, Aether Studio i QFV — przyrost 2026-11-25

- **OMEGA Developer Suite:** 7 lokalnych narzędzi (JSON, Base64, JWT inspect, digest, hasła, UUID) przez launcher oraz `POST /api/local/tools`; narzędzia podłączone także do lokalnego serwera MCP `node integrations/bin/devsuite-mcp.mjs`.
- **Aether Studio — plan:** lokalny `POST /api/local/studio/plan` korzysta z rzeczywistego `overlays/omega-integrations/bridge.mjs` do kompilacji manifestu planistycznego P10/Aether. Nie uruchamia renderera lub engine.
- **P09/QFV — CPU preview:** lokalny `POST /api/local/media/preview` uruchamia istniejący `overlays/omega-integrations/media_bridge.py` w ograniczonym podprocesie Python, zwraca wektory referencyjne, nie film ani obraz.
- Wszystkie nowe lokalne żądania wymagają poprawnego loopback Host, same-origin i niestandardowego nagłówka, mają limity bajtów, nie zapisują historii i blokują podszywanie się pod wykonany build lub render. Nie są to API do udostępniania publicznie.
- Testy bez builda: `npm run test:devsuite`, `npm run test:studio-http`, `npm run test:media-preview` w katalogu Enterprise. Pełnego E2E, builda i testów produkcyjnych nie uruchamiano; patrz `docs/OMEGA_IMPLEMENTATION_2026-11-25.md` repozytorium.

## GGUF Model Manager — lokalna inwentaryzacja 2026-11-25

Kafelek **Katalog modeli GGUF** obsługuje `POST /api/local/models/inventory` i wywołuje istniejący `scripts/gguf-inventory.mjs::scanGGUF`. Katalog ustawia operator w środowisku serwera przez `OMEGA_MODEL_DIR`; ścieżki z żądań HTTP są ignorowane. Serwer nie wywołuje downloadera, inferencji ani model serving. Odczytywane są wyłącznie nagłówki GGUF, rozmiary, wersje i szacunkowy budżet pamięci.

Serwer ma ograniczenia 3 000 wpisów, głębokość 6, wejście HTTP 512 bajtów i wyjście 1 MiB. Udostępnianie w publicznym Internecie nie jest obsługiwane. Modelowy profil RAM jest heurystyką; nie oznacza zatwierdzenia modelu dla Androida czy rzeczywistego testu jakości PL/EN.

`npm run test:models-http` (w katalogu Enterprise) testuje kontrakt HTTP z kontrolowanym skanerem. Uruchomienie rzeczywistego GGUF na Androidzie i ocena językowa pozostają otwarte.

## PL/EN Evaluation, OTCM/ATM, Compute & Experiment — 2026-11-25

Dodatkowe moduły w launcherze korzystają ze źródeł już istniejących w repozytorium, bez uruchamiania głównej kompilacji:

- **PL/EN Model Evaluation:** `POST /api/local/models/evaluate`. Wymaga ustawienia `OMEGA_MODEL_EVAL_ENDPOINT=http://127.0.0.1:PORT/v1/chat/completions`. Najwyżej 12 przypadków na żądanie, wynik to znormalizowany exact-match dla podanego zbioru; nie jest oceną ogólnej jakości modelu. CLI: `node scripts/model-eval.mjs /path/to/cases.json`.
- **OTCM/ATM Memory:** `POST /api/local/knowledge/reconcile`. Ephemeral memory, rozpoznawanie sprzeczności, zawsze `NO_CHECKED_PROOF`, `action_executed=false`; w tym etapie nie ma proof checker ani trwałej pamięci.
- **Offline Inference Policy:** `POST /api/local/compute/plan`. Deklarowana telemetria i inwentarz są niezweryfikowane, brak wykonywania modeli, brak akceptowania grantów, tryb wyłącznie `OFFLINE`, nie ma ruchu chmurowego.
- **Attention/HAEE Experiment Plan:** `POST /api/local/experiments/plan`. Kompiluje plan bez treningu, bez kluczy podpisu i bez zgody na chmurę; oryginalny `experiment_bridge.py` posiada osobny format podpisanych artefaktów OXA i nadal wymaga uprawnień i sprawdzenia datasetu przed realnym treningiem.

Testy bez builda: `npm run test:model-eval`, `npm run test:knowledge-http`, `npm run test:compute-http`, `npm run test:experiment-http`. Ten zestaw weryfikuje zachowanie adapterów i interfejsów, nie fizyczny GPU, NPU czy pełny Tauri/React E2E.

## Developer Suite — cztery kolejne narzędzia offline

`number.base`, `http.status`, `url.inspect` i `curl.build` są dostępne przez ten sam lokalny dispatcher, MCP i GUI PL/EN. `curl.build` generuje wyłącznie tekst polecenia, nie uruchamia go i nie przyjmuje nagłówków Authorization, Cookie ani X-API-Key. Format konwersji liczbowej: `16:ff->10`. Łączna liczba operacji: **26**, nie 200+. Testy: `node --test tests/devsuite-network.test.mjs` z katalogu głównego. Żaden build aplikacji nie został wykonany.

## PDF Reports (ENT-49)
Local PDF editor is wired to the existing ReportLab renderer. Install packages/awesome-printer-tools/requirements.txt and a Unicode TTF before use. From Enterprise root: npm run test:pdf. PDF browser E2E and full build remain open.

## Local text chat
Set `OMEGA_LOCAL_CHAT_ENDPOINT=http://127.0.0.1:8082/v1/chat/completions` to the operator's local server (adjust port). Choose the loaded model in the chat view. No fallback to cloud, no stored history, no streaming. `npm run test:local-chat` from Enterprise root. Backend model must be independently installed and running.

## LLM Training — datasets
Paste or load JSONL, choose evaluation percentage, prepare locally and download train.jsonl, eval.jsonl and manifest.json. No model execution; input limited to 1 MiB JSON request. Test from Enterprise root: `node --test test/training-http.test.mjs` (also included by test:ui glob). Full training remains separate.

## Operations — audit
Read-only protected event list, paginated by agent ID. Requires configured existing audit service (AUDIT_PORT), OIDC token and policy permission. No credential persistence or event modification. Tests: `node --test test/operations-client.test.mjs test/operations-ledger.test.mjs` from Enterprise root. Live stream and production identity integrations remain separate.

## Local artifact storage
Single-operator local-only vault. Use an existing owner-private directory (0700) and separate existing 32-byte random key file (0600); configure OMEGA_STORAGE_DIR and OMEGA_STORAGE_KEY_FILE. Preserve the key securely; loss makes files unreadable. Payloads encrypted; names, hashes, sizes visible. Maximum 4 MiB each, 64 MiB logical payloads, 128 records; deduplication preserves first filename. No shared-tenant mode or network exposure. Test: `node --test test/storage.test.mjs` from Enterprise root.

## Photo Studio — local adjustments
Offline JPG/PNG/WebP raster input, exposure/contrast/saturation/warmth/monochrome, preview and export. 12 MP and 16 MiB input bounds. 8-bit sRGB output, not RAW/ICC/EXIF-preserving. Tests: `node --test test/photo.test.mjs` and `python test/photo-browser-e2e.py` (Chromium, Python Playwright and Pillow, isolated DOM). Actual PNG E2E verified; advanced editing remains separate.

## Audio Studio — WAV
Local PCM16 WAV mono/stereo import, trim, gain, peak normalization and export. 32 MiB input, no uploads or original modification. `node --test test/audio.test.mjs` from Enterprise root. No playback UI, speech transcription, synthesis or generation yet.

## Mining and virtual numbers — read-only
Set OMEGA_SERVICE_READ_CONFIG to an owner-private (0600) local JSON file outside Git. Its optional `mining` array contains objects with exactly id, tenant (UUID), origin (trusted HTTPS), minWatts, maxWatts and token; optional `phone` object contains accountSid, apiKeySid, apiKeySecret and tenant (UUID). At least one section required. Use existing OMEGA_OIDC_ISSUER/AUDIENCE/CLIENT, OMEGA_PDP_URL and OMEGA_PDP_KEY_FILE (0600). Permit policy requires Agent resources mining-<id>, virtual-number or virtual-number-search with read action and correct tenant. Restart local server after config changes. No state mutations, SMS, call or purchase. Never put config or tokens in Git. Test: `node --test test/service-config.test.mjs test/service-read.test.mjs backend/test/approval-race.test.mjs` from Enterprise root.

## Game Studio — narrative
Local data-only scenario editor and playable Aether branching text game. Import JSON, validate graph, play choices and effects, restart and export scenario/trace. No asset generation or 3D engine. Run `node --test test/game.test.mjs` and `python test/game-browser-e2e.py` from Enterprise root (Chromium + Python Playwright). Existing Aether APIs remain reexported by its index.

## Image AI — local ComfyUI
Set OMEGA_COMFY_PORT and OMEGA_COMFY_CHECKPOINT (basename of a compatible installed `.safetensors` checkpoint). Requires trusted locally running ComfyUI and Python 3. Fixed SD checkpoint workflow, PNG export; no arbitrary workflow or cloud fallback. Cancellation stops waiting, not the submitted GPU job. `node --test test/image-http.test.mjs` verifies process/HTTP contracts with fixtures, not actual model inference.

## Video Studio — local MP4
Install FFmpeg and ffprobe with libx264/AAC support. Local H.264/AAC MP4 import, bounded trim/resize/mute, preview and download; input/output 16 MiB, clip up to 30 seconds. No AI generation or codec sandbox yet; operate on trusted files in local mode. `node --test test/video-http.test.mjs` from Enterprise root requires FFmpeg and is included in the UI test glob. Actual native processing tested, browser playback not tested.
