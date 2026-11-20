# Locally-XXX / OMEGA-X

**Status: integracja w toku; brak produkcyjnego APK.** Repozytorium jest nakładką integracyjną na rzeczywisty kod Locally Uncensored, a nie deklaracją ukończonego OMEGA-X.

## Kod bazowy

Źródło: [`mojealterego/locally-uncensored`](https://github.com/mojealterego/locally-uncensored), wersja `2.6.7`, commit `6d96ab92e827e0471586c6291c78067b495ef44a` (`master`). Kod jest przypięty jako submoduł `upstream/locally-uncensored`. Projekt pierwotny: [purpledoubled/locally-uncensored](https://github.com/purpledoubled/locally-uncensored), autor `purpledoubled`. Licencja: **AGPL-3.0-only**; zachować oznaczenia praw autorskich i warunki licencji. Weryfikacja submodułu nie jest równoznaczna z pełną niezależną kopią wszystkich plików w tym repozytorium.

## Uruchomienie na komputerze (Node.js >=22)

```bash
git clone --recurse-submodules https://github.com/mojealterego/Locally-XXX.git
cd Locally-XXX
npm run verify:source
npm --prefix upstream/locally-uncensored ci
npm run dev
```

W istniejącym klonie bez submodułu:

```bash
git submodule update --init --recursive
```

Budowanie: `npm run build`. Testy: `npm run test:gate`, `npm run test:unit`, `npm run test:e2e` (wymagają lokalnie zainstalowanych zależności; E2E wymaga przeglądarki Playwright). Kompilacja desktop Tauri: `npm run tauri:build` (wymaga Rust i systemowych zależności). Komendy przekazują argumenty bez użycia powłoki, a bramka weryfikuje SHA źródła, czystość śledzonych plików, wersję i licencję.

## Kontrola modeli GGUF bez GPU (OMEGA-X)

Dostępny jest rzeczywisty inwentaryzator plików GGUF (Node.js >=22), również do uruchomienia lokalnie w Termux:

```bash
npm run models:inventory -- /sciezka/do/modeli --sha256 --ram-gib 12 --reserve-gib 3
```

Narzędzie nie wczytuje całej wagi do RAM: odczytuje 24-bajtowy nagłówek, rozpoznaje wersję GGUF v2/v3, liczbę tensorów i pól metadanych, a na żądanie oblicza strumieniowo SHA-256. Odrzuca dowiązania symboliczne, raportuje nieprawidłowe pliki i ogranicza głębokość skanowania. Orientacyjny próg RAM bazuje na rozmiarze pliku, rezerwie systemowej i współczynniku narzutu; **nie stanowi dowodu możliwości inferencji na S24 Ultra**. Szczegóły w [GGUF_INVENTORY.md](docs/GGUF_INVENTORY.md).

## Niezależna kopia źródeł (materializacja)

**Checkpoint 2026-11-19:** 1110 z 1112 plików znajduje się bezpośrednio w `migration/staged/locally-uncensored/`, w tym kompletne `src-tauri/`, `src/api/` (wraz z testami), `src/types/`, `src/hooks/`, `src/components/`, `src/stores/`, `src/lib/`, `e2e/` i `scripts/`. Brakuje wyłącznie dwóch binarnych zasobów dokumentacji: `docs/demo.gif` i `docs/social-preview.png`. Zgodność Git 1110/1110; pełny build nie został uruchomiony. Zagnieżdżone workflow upstream nie uruchamiają GitHub Actions w repozytorium docelowym. [Raport zgodności Git](docs/MIGRATION_CHECKPOINT.json).


Po zainicjalizowaniu submodułu można wygenerować pełną, bajtowo zweryfikowaną kopię wszystkich plików śledzonych w Git w katalogu `vendor/locally-uncensored`:

```bash
npm run vendor:dry
npm run vendor:apply
npm run vendor:check
npm run vendor:verify-pinned
```

Dodatkowa bramka `vendor:verify-pinned` porównuje manifest kopii ze zaufanym indeksem 1112 plików zapisanym w `docs/UPSTREAM_FILE_INDEX.json`, sprawdza każdy plik ponownie strumieniowo i odrzuca niespodziewane pliki oraz dowiązania symboliczne. Zobacz [SOURCE_INTEGRITY.md](docs/SOURCE_INTEGRITY.md). 

Importer sprawdza SHA-1 obiektów Git, SHA-256 skopiowanych plików, odrzuca dowiązania symboliczne i nie nadpisuje istniejącej zmodyfikowanej kopii. Tworzy manifest `.omega-source-manifest.json`. Dopóki katalog `vendor/` nie został rzeczywiście wygenerowany, dodany do Git i niezależnie sprawdzony, pełna kopia **nie znajduje się w tym repozytorium**. Po materializacji można uruchomić aplikację bez submodułu bezpośrednio z `vendor/locally-uncensored` (po instalacji zależności).

**Nie uruchomiono automatycznie GitHub Actions.** Oryginalne workflow są zachowane jako nieaktywne pliki pod `docs/upstream-workflows-disabled/` i nie są wykonywane w tym repozytorium.

## Zakres i ograniczenia

- Baza to **desktop Tauri + React + Rust**. Nie stanowi aplikacji Android ani gotowego APK.
- Komponenty OMEGA-X i archiwa z `Omega-XXX-Absolute` wymagają odrębnego przeglądu licencji, integralności i sekretów przed publikacją; repozytorium źródłowe jest prywatne, a niniejsze publiczne.
- Do ukończenia migracji potrzebna jest materializacja pełnych plików źródłowych i niezależne porównanie ich SHA-256. Submoduł jest odtwarzalnym, przypiętym punktem startowym, **nie pełną migracją**.
- Testy deterministyczne zastępują niedostępną infrastrukturę w odbiorze modelowanych właściwości; nie są deklaracją fizycznego testu Android/GPU ani wdrożenia.

Zobacz [roadmapę](docs/ROADMAP.md), [macierz weryfikacji](docs/TEST_MATRIX.md) i [politykę odbioru](docs/VALIDATION_POLICY.md).

## Przygotowanie lokalnego katalogu roboczego bez submodułu

Node.js 22+. Bramka porównuje bajty z przypiętym indeksem `docs/UPSTREAM_FILE_INDEX.json`, odrzuca dodatkowe pliki, niedozwolone ścieżki, symlinki i niezgodny tryb wykonywalności (POSIX). Domyślna ścieżka wymaga wszystkich 1112 plików. Na obecnym checkpoincie można jawnie dopuścić wyłącznie brak `docs/demo.gif` i `docs/social-preview.png`:

```bash
npm run stage:check -- --allow-missing-doc-assets
npm run stage:prepare -- --allow-missing-doc-assets
```

`stage:prepare` tworzy nowy prywatny katalog `runtime/locally-uncensored-*`, ponownie weryfikuje zawartość i zwraca ścieżkę w polu JSON `output`. Nie wykonuje skopiowanego kodu, nie instaluje zależności i nie nadpisuje wcześniejszego katalogu. Po przeglądzie zależności można w tym katalogu wykonać `npm ci`, `npm run build` i `npm run test:e2e`. Nie są to dotychczas zweryfikowane wyniki pełnego buildu. Indeks i checkout projektu są granicą zaufania; narzędzie przeznaczone jest do prywatnego katalogu roboczego, nie do obrony przed równoległym procesem o tych samych uprawnieniach. Walidacja lokalna: Linux, Node.js 22; Windows i Android niezweryfikowane.

### Kotwica integralności indeksu

`stage:check` i `stage:prepare` wymagają zgodności pliku `docs/UPSTREAM_FILE_INDEX.json` z SHA-256 `63ceddf8e29aac9a80a2245f263dd464ec5eb21b3de7516cc728313d90eba0ee` przed parsowaniem. Produkcyjnej kotwicy nie można nadpisać opcją API. Testy innych snapshotów wymagają jawnego, zaufanego digestu. Ochrona zakłada zaufany kod bramki; nie broni przed podmianą samego skryptu przez proces o tych samych uprawnieniach. Zmiana upstream wymaga świadomego odświeżenia kotwicy po weryfikacji pochodzenia indeksu.

## Wspólna bramka integralności SEC-003

`vendor:check` oraz `vendor:verify-pinned` używają tej samej kotwicy SHA-256 i weryfikatora pełnego snapshotu. `verifyVendor()` jako API synchroniczne wymaga teraz zweryfikowanego checkoutu upstream (opcjonalny `source`); porównuje go z istniejącą kopią. Importer kontroluje komplet plików i tryby, odrzuca dodatkowe pliki i symlinki, a przed publikacją weryfikuje cały katalog tymczasowy. Nie ufa samemu manifestowi vendor. Limit pojedynczego pliku importu: 64 MiB, metadanych: 8 MiB, całego importu: 2 GiB. Te ograniczenia dotyczą kodu źródłowego, nie wag GGUF. Używać na zaufanym lokalnym filesystemie; nie stanowi ochrony przed procesem o identycznych uprawnieniach modyfikującym wszystkie pliki w trakcie operacji.

Pełny zestaw bramek `npm run test:gate` (6 plików testowych): 68/68 PASS w odtworzonym środowisku o zgodnych Git blob SHA; pełna kompilacja, uruchomienie aplikacji i testy sprzętowe pozostają niepotwierdzone.

## RAG-001 — lokalne dokumenty XLSX/PDF/DOCX/TXT

Nakładka AGPL-3.0-only zachowuje przypięty snapshot upstream i modyfikuje wyłącznie nowo przygotowany katalog roboczy. Włącz ją poleceniem `npm run rag:prepare -- --allow-missing-doc-assets` (flaga dotyczy dwóch znanych zasobów dokumentacji), następnie z otrzymanej ścieżki uruchom instalację zależności i build aplikacji zgodnie z jej dokumentacją. Dotychczasowe `stage:prepare` i `npm run dev` pozostają ścieżkami bazowymi bez nakładki.

Obsługiwane: XLSX z adresami komórek i nazwami arkuszy, shared/inline strings, zapisane wyniki formuł bez przeliczania; TXT UTF-8 i UTF-16 z BOM; zachowanie znaków i wyszukiwanie tokenów bez polskich diakrytyków. PDF/DOCX używają istniejących już zależności PDF.js/Mammoth z kontrolami wejścia, PDF sprząta zadanie i strony, DOCX przechodzi kontrolę ZIP/XML. Limit wejścia 25 MiB, ZIP 64 MiB, wpis 16 MiB, 2048 wpisów, tekst 1 mln jednostek UTF-16, 500 stron, 100 tys. komórek, 128 arkuszy, 4096 fragmentów, batch embeddingów 16. Niezaufane relacje arkuszy, ścieżki ZIP, DTD i niepoprawne CRC są odrzucane. Nie obsługuje ZIP64, szyfrowania, XLSM ani obliczania formuł. Wymaga nowoczesnego WebView z `DecompressionStream('deflate-raw')`; nie potwierdzono urządzeń Android. Limity nie są pełną izolacją pamięci i CPU złośliwych PDF.

Test modułu: `npm run test:rag-browser` — Python 3, Playwright 1.57.0, openpyxl 3.1.5, Chromium (zmienna CHROMIUM), TypeScript 5.8.3. Testy nie pobierają modelu i nie wymagają sieci. `npm run test:gate`: 72/72 PASS; Chromium: 23/23 PASS. Pełny build, faktyczny PDF.js/Mammoth i embedding backend nadal niezweryfikowane. Raport: `docs/evidence/RAG-001.json`.

## SEC-002 / MIG-004 / GGUF-001 — kontrola offline OMEGA-X

Wymagane Python 3.11+ i system POSIX (O_NOFOLLOW). Komendy z katalogu głównego:

```bash
npm run security:scan -- /sciezka/do/kopii
npm run omega:restore -- /prywatny/katalog/chunks SHA256_Z_ZAUFANEGO_ZRODLA /prywatny/katalog/output.zip
npm run models:layout -- /sciezka/model.gguf
npm run test:omega
```

`security:scan` zwraca JSON z heurystycznymi wykryciami (bez wartości dopasowanych sekretów), deklaracjami licencji, inwentarzem npm/Cargo i osadzonym SBOM CycloneDX 1.5. Exit 0 oznacza wyłącznie brak zdefiniowanych wykryć i braku deklaracji w skanowanym katalogu, 2 oznacza potrzebę przeglądu, 1 błąd. Nie jest to decyzja prawna, skan wszystkich formatów binarnych ani audyt aktualnych CVE. SRI to kontrola formatu sum lockfile, a nie sprawdzenie pobranych paczek. SBOM jest generowany w formacie CycloneDX; walidacja oficjalnym schematem nie została wykonana.

`omega:restore` odtwarza lokalnie prywatny pakiet `omega-chunks-v1`; kotwica SHA-256 manifestu musi pochodzić z niezależnie zaufanego źródła. Sprawdza każdą część i cały plik, ZIP z limitami rozpakowania, ścieżkami, typami i CRC; nie rozpakowuje na dysk, nie wykonuje zawartości i nie nadpisuje istniejącego celu. Nie przyznaje zgody na publikację. Limit całego pliku 20 GiB, części 64 MiB; ZIP 2 GiB po rozpakowaniu, pojedynczy wpis 256 MiB. Katalog roboczy musi być zaufany i prywatny; brak ochrony przed równoległym procesem o identycznych uprawnieniach.

`models:layout` rozszerza dotychczasowy skan nagłówka GGUF o kontrolę metadanych i układu tensorów v2/v3 little-endian. Obsługiwane są wybrane typy GGML, m.in. Q4_K, Q5_K, Q6_K, F16/F32 i Q8_0. Nieobsługiwane kwantyzacje nie są uznawane za poprawne. Nie weryfikuje wartości tensorów ani zgodności z architekturą konkretnego modelu. Specyfikacja: https://github.com/ggml-org/ggml/blob/master/docs/gguf.md.

Testy: 24/24 offline Python i 72/72 regresji Node. Rzeczywiste zdalne bajty jednego prywatnego archiwum potwierdzono przez dekodowanie części i porównanie SHA-256 w pamięci, oddzielnie od lokalnych testów importera. Nie przeniesiono prywatnych materiałów do publicznego repozytorium. Szczegóły: `docs/evidence/SEC002-MIG004-GGUF001.json`.

## Polityka odbioru bez niezależnej infrastruktury

[VALIDATION_POLICY v3.0](docs/VALIDATION_POLICY.md) ustanawia deterministyczne testy inżynieryjne z symulowanymi granicami niedostępnej infrastruktury jako podstawę odbioru modelowalnych kryteriów. Zewnętrzny audyt, zewnętrzna certyfikacja, płatne CI oraz fizyczne powtórzenie zaliczonych kryteriów symulacyjnych nie są wymagane. [Macierz testów RUN/AND/GPU](docs/SIMULATION_MATRIX.md) rozdziela ENGINEERING (w tym SIM-PASS) od PHYSICAL. Symulacja nie zastępuje implementacji ani faktycznego buildu, instalacji lub pomiaru, jeśli są one deklarowane jako wykonane.

## RUN-001 / AND-001 / GPU-001 — kontroler lokalnego wykonania

Nowy moduł `scripts/runtime_control.py` to samodzielny adapter Python 3.11+ / POSIX. Nie zastępuje istniejących adapterów UI ani silników inferencji. Uruchamia rzeczywiste procesy (bez shell), zapisuje logi i ich SHA-256, blokuje współbieżny build w tym samym katalogu oraz odrzuca brakujące lub stare produkty buildu. Przygotuj świeży zaufany katalog np. `npm run rag:prepare -- --allow-missing-doc-assets`. Instalacja zależności npm i Cargo działa w trybie offline; inne narzędzia, np. Gradle, mogą wymagać cache lub sieci. Uruchamiaj tylko zaufany kod i workflow. Katalog raportów musi istnieć.

```bash
npm run runtime:build -- desktop /trusted/workspace /private/build-reports
npm run runtime:build -- android /initialized/android-workspace /private/build-reports
npm run runtime:android-probe
npm run runtime:chat -- 8127 local-model "Tekst"
npm run runtime:render -- 8188 /trusted/workflow.json output.png 7680 4320 1024
npm run test:runtime
npm run test:python
```

Desktop: npm ci, build frontend, cargo test --locked, Tauri build --no-bundle. Ścieżka kontrolera dotyczy binarium POSIX o nazwie locally-uncensored; build nie jest uniwersalnym dystrybutorem. Android wymaga wcześniej utworzonego i zintegrowanego projektu natywnego, SDK/NDK/JDK i skonfigurowanego podpisu. Kontroler wybiera pojedyncze APK release w strukturze Gradle, sprawdza biblioteki AArch64 ELF oraz wywołuje apksigner verify. Nie sprawdza oczekiwanego odcisku certyfikatu wydawcy, nie podpisuje i nie instaluje APK. Dokumentacja: https://v2.tauri.app/reference/cli/ i https://v2.tauri.app/distribute/google-play/.

Opcjonalne flagi Termux dla chat/render: `--android-lease-mib` i `--temperature-mc` muszą wystąpić razem. Temperatura w tysięcznych stopnia C ze źródła zaufanego przez wywołującego. Kontroler sprawdza ABI przez getprop i RAM przez /proc/meminfo; rezerwa 1024 MiB, progi 43/39.5 C, ważność próbki 10 s. Histereza i rezerwacje dotyczą życia pojedynczego obiektu ResourceGate. To kontrola dopuszczenia, nie ciągłe monitorowanie temperatury ani broker między procesami.

Chat korzysta z rzeczywistego HTTP do 127.0.0.1 oraz /v1/chat/completions; rendering z /prompt, /history i /view. Brak ponownego POST przy nieznanym wyniku operacji. Ograniczona liczba odpytań i rozmiary odpowiedzi. Wymagany zaufany lokalny ComfyUI workflow zwracający dokładnie jeden PNG. Sprawdza CRC, wymiary, rozmiar rozpakowanych danych w obsługiwanym podzbiorze PNG (RGB/RGBA 8-bit bez przeplotu), zapisuje atomowo bez nadpisania. Heurystyka 16 B/px dotyczy buforów obrazu, nie VRAM modelu. Nie implementuje automatycznego tilingu, sklejania, anulowania zadania po stronie serwera ani doboru checkpointu.

Wynik: 23/23 nowy kontroler; 72/72 Node, 47/47 Python (zawiera 23 nowego kontrolera), 23/23 Chromium, razem 142 unikatowe testy. Testy procesów i transportu HTTP wykonano lokalnie; Android, toolchain aplikacji oraz backend modeli zastąpiono kontrolowanymi fixtures. 8K testowe PNG jest deterministyczną bitmapą, nie wynikiem modelu. Brak pełnego checkoutu, buildu produktu, podpisanego APK oraz pracy sprzętowej. Macierz: `docs/SIMULATION_MATRIX.md`, raport: `docs/evidence/RUN001-AND001-GPU001.json`.

## AND-001 / GPU-001 — trwały broker zasobów i recovery

Wymagania: Python 3.11+, POSIX/Linux/Termux, prywatny katalog na lokalnym filesystemie obsługującym SQLite, flock, hardlink oraz fsync. Nie używać współdzielonego Android storage dla dzienników. Ścieżkę sensora wybiera operator; musi zwracać zaufaną wartość w milistopniach C (np. odpowiedni thermal_zone/temp, zależny od urządzenia). Jeżeli sensor/getprop/proc jest niedostępny, admission pozostaje zamknięte. CLI działa niezależnie od UI; nie jest jeszcze domyślnym adapterem aplikacji.

Broker: w osobnym procesie uruchom monitor; wszystkie kooperujące zadania korzystają z tego samego prywatnego katalogu. FIFO jest ścisłe; istniejące rezerwacje są uwzględniane w budżecie, próbka wygasa po 10 s. Błąd klienta lub śmierć procesu nie oznacza zakończenia obliczeń serwera: ORPHANED zatrzymuje nowe przydziały do czasu uzgodnienia stanu. Monitor nie zabija działających zadań po wzroście temperatury. Limit 128 oczekujących/aktywnych/osieroconych wpisów, 10 000 wpisów dziennika (wymaga archiwizacji offline po osiągnięciu limitu).

```bash
npm run runtime:broker -- "$HOME/omega-broker" monitor /trusted/thermal/temp
npm run runtime:broker -- "$HOME/omega-broker" status
npm run runtime:broker -- "$HOME/omega-broker" chat 8127 model "Tekst" 2048
```

Odzyskiwalny render (oddzielny prywatny katalog na każde zadanie, ścieżka wyjścia nie może istnieć):
```bash
npm run runtime:recoverable-render -- "$HOME/omega-job-001" 8188 start workflow.json output.png 7680 4320 1024 --broker-dir "$HOME/omega-broker" --lease-mib 4096
npm run runtime:recoverable-render -- "$HOME/omega-job-001" 8188 status
npm run runtime:recoverable-render -- "$HOME/omega-job-001" 8188 resume
```

GET history/view: maksymalnie 3 próby dla TIMEOUT/TRANSPORT, backoff 0.25/0.5 s, maksymalnie 120 iteracji polling na wywołanie. Nie ma automatycznego ponawiania POST. SUBMITTING/UNKNOWN wymagają ręcznego wyjaśnienia, ACCEPTED pozwala wznowić pobranie po znanym prompt_id. READY weryfikuje SHA-256 przed zatwierdzeniem DONE. Resume nie wykonuje nowej generacji ani nie zwalnia osieroconej rezerwacji. Po niezależnym sprawdzeniu, że wszystkie powiązane obliczenia naprawdę zakończono, operator może użyć `runtime:broker -- DIR reconcile TICKET --backend-idle-confirmed`. Flaga jest oświadczeniem operatora, nie pomiarem backendu. Nie stosować przy niepewnym stanie. Brak izolacji między niezaufanymi procesami tego samego UID, brak automatycznego anulowania GPU i aktualnego pomiaru VRAM.

Testy nowego kodu: 13 broker + 11 recovery = 24; pełna regresja 166/166. Zbadano rzeczywiste SIGKILL lokalnego procesu, SQLite, flock, fsync i odzyskanie atomowego wyniku; sensory Androida i odpowiedzi ComfyUI były symulowane. Pełny build, realny model, APK i urządzenie NOT_RUN. Raport: `docs/evidence/AND001-GPU001-RECOVERY.json`.

## GPU-001 — Tiled Reference Upscale & Stitching 8K

Nowy moduł `scripts/tiled_upscale.py` (Python 3.11+, Pillow 12.3.0, POSIX) planuje i wykonuje kafelkowy upscaling jednego obrazu źródłowego w zaufanym lokalnym ComfyUI. Wymaga istniejącego modelu upscalingu o natywnej skali 2× lub 4×. Nie jest to niezależne generowanie dyfuzyjne kafli z promptu. Wykorzystuje węzły LoadImage → ImageCrop → ImageUpscaleWithModel z UpscaleModelLoader → SaveImage. Dokumentacja: https://docs.comfy.org/built-in-nodes/ImageCrop i https://docs.comfy.org/built-in-nodes/ImageUpscaleWithModel.

```bash
python3 -m pip install -r requirements-upscale.txt
npm run runtime:tiled-upscale -- "$HOME/omega-tile-job" 8188 /trusted/ComfyUI/input/source.png /trusted/ComfyUI/models/upscale_models/model.pth output.png --scale 4 --core 1024 --halo 64 --budget-mib 64
npm run test:tiled
PYTHONPATH=. python3 tests/measure_tiled_memory.py
```

Źródło RGB PNG bez EXIF (maks. 64 MiB z dodatkową kontrolą budżetu, maks. 16 777 216 pikseli) musi pokrywać docelową geometrię zgodnie ze skalą modelu. Nazwy wejścia/modelu to proste nazwy plików dostępnych pod identycznymi nazwami w katalogach ComfyUI. Operator odpowiada za zaufany backend, model i niezmienność plików; lokalna suma modelu nie dowodzi, który plik modelu rzeczywiście załadował serwer. SHA-256 źródła z endpointu /view?type=input porównywany jest przed i po zadaniach. Nie ma automatycznego pobierania modeli ani wykonania niezaufanych workflow.

Maks. wyjście 8192×8192, rdzeń 128–1536 pikseli, halo do 1/4 rdzenia, maks. 256 kafli, automatyczne zmniejszanie rdzenia przy przekroczeniu estymaty buforów. Kafle mają spójne współrzędne względem referencji i wspólną siatkę. Klient przetwarza jeden kafel RGB naraz, zapisuje piksele RAW do prywatnego scratch i scala linie RGB z nakładających się poziomych/pionowych obszarów, bez alokacji pełnej bitmapy wyjściowej. Estymata nie jest twardą granicą RSS/VRAM. PNG RGB 8-bit bez zachowania ICC/EXIF; crossfade ogranicza różnice na łączeniach, ale nie gwarantuje niewidocznych szwów dla prawdziwego modelu.

Dziennik główny i osobny RenderJob dla każdego kafla, przypięte SHA wejścia/modelu, znane prompt_id, brak replay niejednoznacznego POST. Wznowienie: powtórz identyczną komendę. Gotowe kafle są weryfikowane według SHA. Nieznany POST wymaga ręcznego wyjaśnienia; nie generuje się ponownie automatycznie. Unikalny prywatny staging i atomowy link bez nadpisywania. Katalog job musi być dedykowany, prywatny i należący do operatora, filesystem obsługiwać flock, hardlink i fsync. Nie używać współdzielonego Android storage na stan. Pozostaje możliwość osierocenia prywatnego stagingu przy SIGKILL przed zapisem ścieżki w dzienniku. Nowy CLI nie jest jeszcze połączony z domyślnym UI ani brokerem.

Testy: 20/20 nowych, 186/186 pełnej regresji, 100 deterministycznie wygenerowanych układów (seed 3108). 1920×1080 → 7680×4320, 40 kafli, faktyczne scalanie i kontrola pikseli na granicy. Dwa pomiary syntetycznych kafli dały identyczny plik SHA-256 da74d8701c807067e17f4e638a1004643a1cff21efd58a7b03120a18c2b75e58, 261299 B. Zmierzony całkowity peak RSS procesu Linux około 109 MiB (bazowa wartość około 93.5 MiB); estymata buforów planera 39 223 296 B. Czas scalania 4.022 / 3.982 s w dwóch przebiegach. To nie jest benchmark GPU ani wynik AI; model zastąpiono deterministycznym backendem. Pełny build aplikacji i rzeczywista inferencja NOT_RUN. Raport i surowe logi: `docs/evidence/GPU001-TILED-8K.json`, `docs/evidence/GPU001-TILED-8K/`.

## GPU-001 — Managed GPU: broker, VRAM i bezpieczne zatrzymanie

`scripts/managed_gpu.py` integruje trwały broker zasobów z TiledJob. Wymaga tego samego prywatnego katalogu brokera oraz aktualnych próbek monitorowanego RAM/temperatury. Nazwa typu urządzenia i indeks podane przez operatora muszą odpowiadać zaufanemu backendowi ComfyUI oraz jednoznacznemu wpisowi devices w /system_stats. vram_free to telemetria backendu w bajtach; nie stanowi rezerwacji VRAM ani gwarancji zużycia modelu. Brak poprawnego odczytu lub niewystarczający próg powoduje odmowę przed POST; brak niejawnego CPU fallback.

```bash
npm run runtime:managed-gpu -- tiled "$HOME/omega-job" 8188 "$HOME/omega-broker" /trusted/ComfyUI/input/source.png /trusted/ComfyUI/models/upscale_models/upscale.pth output.png --lease-mib 4096 --device-type cuda --device-index 0 --min-vram-mib 1024 --scale 4 --core 1024 --halo 64 --budget-mib 128
npm run runtime:managed-gpu -- stop "$HOME/omega-job" 8188
npm run runtime:managed-gpu -- cancel-pending "$HOME/omega-job/tile-000-000" 8188
npm run test:managed-gpu
```

Przykład cuda dotyczy kompatybilnego backendu, nie potwierdza CUDA na Androidzie. Managed job zapisuje konfigurację admission (broker, urządzenie, próg); wznowienie wymaga identycznej konfiguracji. Nie można wznowić go przez zwykłe runtime:tiled-upscale. Przed nowym kaflem kontrolowane są rezerwacja, stan termiczny, aktualność próbki, RAM i aktualne wolne VRAM. Na znanej bezczynnej granicy odmowa zwraca PAUSED (exit 2) i zwalnia rezerwację; powtórz identyczną komendę po przywróceniu warunków. Niepewny POST pozostawia ORPHANED i wymaga ręcznego uzgodnienia. Nie uruchamiaj automatycznego restartu ani zwolnienia rezerwacji przy nieznanym stanie backendu. Działające już zadanie nie jest siłowo kończone.

Stop tworzy trwały marker stop.request; blokuje nowe kafle i rozpoczęcie końcowego scalania na najbliższym checkpoint. Nie jest gwarancją przerwania aktywnego kafla lub już rozpoczętego scalania. Wznowienie po intencjonalnym stopie wymaga nowego zadania (marker nie jest automatycznie usuwany). Cancel-pending, uruchomione na prywatnym journalu konkretnego zadania po zwolnieniu jego blokady, sprawdza /queue i wysyła wyłącznie POST /queue z delete zawierającym jeden zapisany prompt_id. Nie wysyła globalnego interrupt ani clear. Samo zniknięcie wpisu z kolejki nie dowodzi anulowania; CANCEL_UNCONFIRMED/CANCEL_UNKNOWN nie zwalniają osieroconego lease. Przy CANCELLING po awarii nie ma ponowienia POST. CANCEL_TERMINAL oznacza znaleziony terminalny status backendu, nie gwarancję skutecznego anulowania. Rzeczywisty kontrakt: https://github.com/Comfy-Org/ComfyUI/blob/master/server.py.

Testy: 16/16 managed GPU, 72/72 Node, 107/107 Python, 23/23 Chromium; 202 unikatowe testy. Testy ComfyUI i sensorów są deterministyczne, HTTP 200 bez treści dla /queue sprawdzono na lokalnym serwerze. Pełny build, aktywny model, fizyczne GPU, Android/UI NOT_RUN. Raport: `docs/evidence/GPU001-MANAGED.json`; logi RED/GREEN i SHA-256 w pakiecie przyrostu.

## v3.0 — odbiór inżynieryjny i integracja Android/GPU/SEC

**Android:** istniejący kontroler `runtime:build` wymaga dla Androida przypiętej tożsamości podpisu SHA-256 i identyfikatora pakietu. Opcja inicjalizacji korzysta z Tauri CLI; nie tworzy niezależnego projektu aplikacji ani nie pobiera samoczynnie brakującego toolchainu. Wersja z flagą inicjalizacji jest testowana z deterministycznym runnerem. Nie naprawia desktopowego entrypoint Rust i pozostałych zależności Android. Przykładowe polecenie z rzeczywistymi wartościami operatora:

```bash
npm run runtime:build -- android /trusted/workspace /private/reports --initialize-android --signer-sha256 "$APK_SIGNER_SHA256" --package-id "$APP_PACKAGE_ID"
npm run runtime:android-lifecycle -- "$DEVICE_SERIAL" /trusted/app.apk "$APP_PACKAGE_ID" "$APK_SIGNER_SHA256" --confirm-force-stop
```

Lifecycle sprawdza zainstalowany pojedynczy base.apk względem lokalnego artefaktu, podpis/pakiet, ARM64 i dwa cykle start/force-stop. Nie instaluje APK i wymaga jawnej zgody na force-stop. Nie jest E2E odzyskania danych aplikacji. Symulowane ADB, apksigner, apkanalyzer, init/build; faktyczny Android NOT_RUN.

**GPU:** `scripts/backend_supervisor.py` rozszerza istniejące `runtime:managed-gpu` przez opcjonalne `--owned-comfy-root` i `--owned-state`, `--backend-restarts`, `--startup-deadline`. Do tego samego polecenia tiled z wcześniejszej sekcji dodaj prywatny, dedykowany katalog zaufanego ComfyUI i katalog stanu. Start w czasie lease, kontrola lokalnego portu i socketu z procfs, ograniczony restart przed nowym POST, weryfikacja źródła po restarcie, zatrzymanie własnego backendu przed zwolnieniem lease. Nie przejmuje obcych procesów i nie wysyła globalnego interrupt do współdzielonego backendu. Niepewny stan pozostaje kwarantanną; nierozstrzygnięty dziennik kafla blokuje start świeżego backendu. Zaufana lokalna instalacja i kooperujące procesy są warunkiem stosowania; brak izolacji wobec złośliwego użytkownika tego samego UID, możliwość odmowy procfs na Androidzie. Stop podczas aktywnego zadania obserwowany przed kolejnym żądaniem HTTP; nie jest pomiarem czasu reakcji GPU ani gwarancją natychmiastowego przerwania blokującego żądania.

**SEC-002:** `npm run security:scan -- DIR --osv-snapshot /trusted/records.json --osv-sha256 "$TRUSTED_SHA256"`. Snapshot jest tablicą rekordów OSV, maks. 32 MiB, wymagany przypięty zaufany digest. Obsługiwane dokładne wersje i ścisłe SEMVER: introduced/fixed/last_affected; niewspierane zakresy (np. GIT/ECOSYSTEM/limit), wycofane rekordy i nieprawidłowa wersja wymagają przeglądu. Duplikaty kluczy/ID, pusty snapshot i przekroczenie budżetu odrzucane. Brak snapshotu oznacza advisory NOT_RUN, nie weryfikację braku CVE. Cargo/npm sprawdzają deklarowane sumy, nie pobrane paczki. Format: https://ossf.github.io/osv-schema/. Skan heurystyczny i wynik review_ready nie są zgodą publikacyjną ani dowodem kompletności bazy/licencji.

```bash
npm run test:native-acceptance
npm run test:advisories
npm run test:gate
npm run test:python
npm run test:rag-browser
```

26 nowych testów; regresja 228/228, 39 testowanych blob SHA. SIM-GPU-02 odebrana w zakresie dedykowanego backendu i bezpiecznej odmowy przy współdzielonym; pozostałe dwa scenariusze Android PARTIAL z powodu brakującego kodu mobilnego. Wszystkie tryby zgodne z dyrektywą v3.0; brak automatycznego zaliczenia pełnego produktu. Raport i 12 surowych logów: `docs/evidence/V3-ACCEPTANCE.json` oraz `docs/evidence/V3-ACCEPTANCE/`.
