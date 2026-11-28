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

## ODYN Ω / Agents Market — signed local catalog
Configure OMEGA_AGENT_CATALOG (signed envelope JSON) and OMEGA_AGENT_PUBLIC_KEY (Ed25519 SPKI PEM) on the local server. Both files must be owner-private regular files with no symlinks. The envelope has `payload` and `signature` canonical Base64 strings. Sign the exact UTF-8 bytes of a JSON payload with `schema: omega.agent.catalog.v1`, `issuer` (lowercase identifier), `issuedAtMs`, `expiresAtMs` (max 31 days) and `entries` (max 256). Entries contain id, version, name, description, license, artifactSha256, artifactBytes, state (DEVELOPMENT/AVAILABLE/SUSPENDED/RETIRED), and offer (null or currency PLN/EUR/USD, minorUnits, terms; AVAILABLE only). To sign the payload with Node crypto use `sign(null, payloadBytes, privateKey)`; Base64-encode both payload bytes and signature, never put the private key into the server configuration. Verify the key provenance independently. No signed catalog is bundled; empty/unconfigured/invalid catalog fails closed. Actual artifacts/certification, lifecycle, payments and distribution remain separate. Test: `node --test test/signed-registry.test.mjs`.

## Mobile Agent — host status
Run web shell on the Android ARM64 host with Python and the existing `getprop`/memory probe available. Set `OMEGA_ANDROID_PROBE=YES` only if the local operator authorizes reading host telemetry. The UI requires explicit confirmation on every request. It returns ABI and available RAM only; not remote phone status, battery/thermal, privilege elevation or workload admission. `node --test test/mobile-status.test.mjs` tests process and HTTP with controlled fixtures. Physical Android validation remains open.

## OMEGA Studio Ultimate — local integrated domain tools
The launcher uses the original Apache-2.0 Python components from `integrations/omega-studio` via a bounded same-origin local bridge. Requires Python 3.11+; no new package install for these three operations. Supports agent DAG waves/cost, exact rational AV frame/sample calculations, halo-aware image tile planning. Does not execute jobs or render. `node --test test/omega-studio.test.mjs` from Enterprise root. Full Studio runtime and APK integration remain separate.

### GeoDepth geometry tool
Within OMEGA Studio Ultimate, select geometry to calculate camera-space XYZ from supplied depth, calibrated intrinsics and optional crop/resize. `point.kind` is `optical_z` or `ray_range_rho`; `crop` is null or x,y,width,height,outWidth,outHeight. Point coordinates refer to the post-crop image. Results use arbitrary scale and do not establish metric depth, model inference, or measurement. Run `python -m unittest discover -s tests -v` from `integrations/omega-studio`.

### C2 Blending / AST comparison
Install the optional NumPy dependency for C2 with `python -m pip install -r integrations/omega-studio/requirements-blend.txt` from repo root, using the interpreter that the server invokes. Blend uses `shape` (H,W or H,W,C), `axis` 0/1, flat `left`/`right` arrays of finite linear-color samples, at most 1024 values each and 1/3/4 channels. AST uses `left`/`right` Python source strings and power-of-two `dimensions` (8–4096); results are structural heuristic scores only. No code execution, color conversion or full image assembly. Both use the existing Studio endpoint. Focused verification: `python -m unittest discover -s tests -p test_extra_bridge.py -v` from integrations/omega-studio and `node --test test/studio-extra-http.test.mjs` from Enterprise root.

### Safetensors / LoRA checkpoint audit
On supported POSIX hosts set `OMEGA_STUDIO_MODEL_DIR` to a canonical absolute owner-controlled directory with trusted ancestors. Directory and files must belong to the server UID and not be group/other writable; file must be regular with one link. Existing Studio selector accepts checkpoint-audit, name (ASCII basename ending .safetensors), mode (container or lora), hash (boolean). Header up to 1 MiB/8192 tensors, logical file size up to 128 GiB, full hash up to 64 MiB, 5s process deadline. `hash:false` only checks structure, not payload integrity. No merge, model execution or base identity verification; declared metadata is not proof. Do not expose to untrusted local processes or multi-tenant networks. Test `python -m unittest discover -s tests -p test_checkpoint_audit.py -v` from integrations/omega-studio; `node --test test/studio-checkpoint-http.test.mjs` from Enterprise root.

### Adaptive CI — approved local Python syntax check
The Studio selector `ci-compile` accepts `approved` (must be true) and `files` (1–16 objects with `name` and `source`). The UI requires explicit confirmation; sample defaults to false. Only flat Python basenames and 24 KiB total source, no arbitrary commands, paths or real workspace modifications. The original Adaptive CI compiler is hardened with -I -S, and the original CI Singularity gate verifies a process-local approval receipt. The compiler executes on a disposable snapshot; `executed:false` in the bridge protocol refers to submitted source execution, with `result.compiler_executed:true` and separate PASS/FAIL. HMAC keys are ephemeral, not a durable or independently authenticated approval. Three-second compiler timeout, five-second bridge timeout; not an OS sandbox or complete CI/CD runner. Tests: `python -m unittest discover -s tests -p test_ci_compile_bridge.py -v` in integrations/omega-studio and `node --test test/studio-ci-http.test.mjs` in Enterprise root.

### Code Swarm and MCP configuration validation
Studio `code-review` accepts source (nonblank Python, max 12,000 UTF-8 bytes) and mode leak/duo. Four static heuristic checkers, capped findings and content SHA-256. Syntax parser success is not a security audit. No execution or repair. `mcp-validate` accepts up to 32 records with name, transport (stdio or streamable-http), command array and URL. Uses disposable original registry; no network, execution, active registration or endpoint security proof. Do not submit credentials; temporary registry files are plaintext, cleaned on normal exit only. Tests: `python -m unittest discover -s tests/integration -v` from integrations/omega-studio and `node --test test/studio-analysis-http.test.mjs` from Enterprise root.

### Holographic Memory Weaver
On supported POSIX hosts configure OMEGA_STUDIO_MEMORY_DIR as a canonical absolute owner-only directory (0700) with trusted ancestors; put a regular owner-private memory.bin (0600, 1 byte to 64 MiB) inside it. Do not allow untrusted same-UID processes or external concurrent modifications. `memory-index` with approved:true computes a persistent 64 KiB block SHA-256/phase index and whole-file digest. `memory-read` with approved:true, offset and length (1–4096 bytes within file) returns verified range as Base64 and digest; the UI asks for confirmation. Metadata is plaintext in memory.sqlite, not encrypted/authenticated. The trusted SQLite index must be preserved; reindex explicitly after source changes. Cooperative flock prevents competing adapter operations. Not a general storage API, neural memory, RAM replacement or multi-tenant service. Test `PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests -p test_memory_bridge.py -v` from integrations/omega-studio. HTTP and GUI source wiring not runtime tested in this increment.

### Persistent Image AI queue (optional)
Set OMEGA_IMAGE_QUEUE_DIR to an existing private canonical owner directory (0700), and configure OMEGA_COMFY_PORT / OMEGA_COMFY_CHECKPOINT as before. Requires POSIX and Node 22 with node:sqlite. In Image AI use Enqueue, Refresh, then explicitly Run the oldest queued job; direct render is disabled while the queue is configured. Jobs use UUID idempotency and retain their fixed port/checkpoint basename; an expired 180s wall-clock claim or failed runner is UNKNOWN and blocks later work until manual operator acknowledgement after checking the backend. No automatic resubmission or claim of GPU cancellation. At most 16 records total (including terminal jobs) and 8 MiB per result; no deletion/retention API in this increment. Prompts, results and metadata are plaintext in a private SQLite file. Trust the server UID, directory ancestors, system clock and local ComfyUI. No remote or multi-tenant service. Run `node --test test/image-queue.test.mjs` from Enterprise root. HTTP tests use a deterministic PNG fixture; real GPU and GUI remain unverified.


## Media queue (image + video, operator opt-in)

Requires Node >=22 with node:sqlite and a POSIX private directory. From the Enterprise root:

```sh
mkdir -m 700 "$HOME/omega-media"
export OMEGA_MEDIA_QUEUE_DIR="$HOME/omega-media"
unset OMEGA_IMAGE_QUEUE_DIR
node apps/web/media-admin.mjs worker worker.json
node apps/web/media-admin.mjs register workflow.json
node apps/web/media-admin.mjs list
pnpm run build:web
pnpm run start:web
```

Before switching modes, stop all legacy servers, finish or manually reconcile all old RUNNING/UNKNOWN jobs and verify that GPUs are idle. The old image database is preserved but not migrated. Use exactly one database and exclusively dedicated ComfyUI processes, one per physical GPU, bound to distinct loopback ports; do not submit directly or from another scheduler. Worker JSON has exactly `{"id":"gpu0","port":8188,"vram":12000,"enabled":true}`; VRAM is declared MiB, not measured. Reapply the same ID, port and VRAM with enabled:false to drain (no cancellation). Do not alias one GPU across multiple ports. No remote hosts.

For workflow.json, export an actual ComfyUI **API format** graph and wrap it in an object with exactly these fields: id (identifier), kind (image/video), minVram (MiB), promptNode (node ID with literal inputs.text), outputNode (save node ID), outputKey (images/videos/gifs, images only for image), graph (the exported object). Configure the model, negative prompt, seed, resolution and duration inside that graph. Use reviewed, installed, trusted nodes only; arbitrary custom nodes may execute code. A video graph must return exactly one output MP4; image graph exactly one PNG. Registering a changed graph creates an immutable content-addressed version. Registration is local CLI only; the browser changes only the selected node's text input. No credentials in workflow files.

Open Video Studio → AI generation queue; refresh, select workflow, type prompt, enqueue, explicitly run oldest waiting job. To run on another GPU while one request is open, use a separate tab and refresh. Acknowledgement of UNKNOWN is allowed only after checking the associated backend is idle; it does not prove success or cancellation. The application does not interrupt remote execution. 16 retained jobs (no purge yet), 64 workflow versions, 16 workers; max output 32 MiB MP4 or 8 MiB PNG. The media queue's database contains unencrypted prompts, workflow graphs and results. File signature/container structure + SHA-256 checks are not complete decode or semantic validation. This mode disables the direct image renderer; the old Image AI panel remains legacy and the combined queue lives in Video Studio. Full app build, browser E2E and GPU execution are unverified.

Targeted tests: `node --test test/media-queue.test.mjs`.

## Automatic media scheduler and history recovery

With the same private media queue directory and dedicated loopback ComfyUI instances configured as above, run from the Enterprise root:

```sh
node apps/web/media-scheduler-cli.mjs --approve-all-queued 2
```

The explicit flag authorizes **all existing and future queued jobs** while the process is running. Start only on a trusted single-operator host; this is not per-job approval. The argument is a per-process parallel limit (1–16), not a global budget. SQLite still enforces one active or unknown job per logical worker across connections. Strict FIFO can block smaller jobs behind a job with no eligible GPU. The process polls the queue every second and does not retry or resubmit failed jobs. SIGINT/SIGTERM stops admissions, aborts local waits, and records uncertain work as UNKNOWN; remote ComfyUI execution may continue. Manual GUI execution remains compatible. Run and supervise the process yourself; it is not started by the web server.

To attempt recovery of one UNKNOWN job (replace JOB_ID with its UUID):

```sh
node apps/web/media-scheduler-cli.mjs --recover JOB_ID
```

Recovery performs a single bounded history query and, for a recorded successful completion, fetches and validates the declared output. It uses only GET and never resubmits. Missing, incomplete, failed or unavailable history leaves UNKNOWN unchanged. A competing acknowledgement invalidates the recovery write. Exit 0 indicates recovered, 2 not recovered, 1 a configuration or execution error. This assumes trusted dedicated backend and preserved history; no proof of model execution, cancellation, or hardware identity is supplied.

Targeted regression: `node --test test/media-queue.test.mjs test/media-scheduler.test.mjs`.
