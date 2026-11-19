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
- Testy deterministyczne nie zastępują sprzętowych testów Android, GPU ani produkcyjnego E2E.

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

[VALIDATION_POLICY v2.0](docs/VALIDATION_POLICY.md) ustanawia deterministyczne testy inżynieryjne z symulowanymi granicami niedostępnej infrastruktury jako podstawę odbioru modelowalnych kryteriów. Zewnętrzny audyt i płatne CI nie są wymagane. [Macierz testów RUN/AND/GPU](docs/SIMULATION_MATRIX.md) rozdziela ENGINEERING (w tym SIM-PASS) od PHYSICAL. Symulacja nie zastępuje implementacji ani faktycznego buildu, instalacji lub pomiaru, jeśli są one deklarowane jako wykonane.
