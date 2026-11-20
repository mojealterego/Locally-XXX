# OMEGA Enterprise — ENT-41/42/43: katalog, symulator, token context

Data: 2026-11-21. Base main: 51e9873e48237943bbdf644614abd07932de54cd. Gałąź docelowa tylko main. Brak dodatkowych branchy, force push, uruchamiania płatnych CI i operacji produkcyjnych.

## Pochodzenie i zakres

Repozytorium PurpleDoubleD/discogs-viewer, SHA 54051dc9d37185803b763e15974fc47d6f5c7af1 (master), zawiera README, SPEC i pojedynczy index.html. README deklaruje MIT, lecz w odczytanym drzewie brak pliku LICENSE. Zamiast kopiowania kodu zastosowano niezależną implementację tego samego wzorca UX: lokalny search/filter/sort/pagination. Żadnych zapytań do Discogs API, danych Discogs czy nieautoryzowanego importu.

## Implementacja i kontrakty

- `integrations/src/catalog-index.mjs`: indeks tylko w pamięci, limit 50000 elementów, allowlist pól, limit ciągów/array, bezpieczna kopia metadanych, brak ujawniania mutowalnej kolekcji danych, polskie diakrytyki, przecięcie tokenów, kategorie, tagi, lata, stabilne sortowanie, paginacja. Brak automatycznego odpytywania remote API i multi-tenant authorization w tym module (musi być wcześniej).
- `integrations/src/catalog-browser.mjs`: komponent DOM bez HTML injection; wyrenderowany launcher z wyszukiwaniem i filtrem statusu, wynik po zmianie input, planowane kafelki pozostają disabled. `apps/web/app.mjs` podłącza komponent, build kopiuje moduły, serve ma wyraźną allowlistę.
- `ide-studio/workspace.mjs`: `viewportLayout(deviceWidth,deviceHeight,availableWidth,availableHeight)` używa istniejącego viewportScale; zwraca renderedWidth, renderedHeight, unscaledVisibleHeight. `apps/web/app.mjs` używa wymiarów renderowanych po przeskalowaniu, zabezpieczając obie osie i unikając podwójnego skalowania.
- `backend/src/optimization/token-budget.mjs`: `historicalWeight(age,decay,minWeight)` i `allocateHistoricalTokens(budget,weights)` z deterministycznym podziałem największych reszt, suma kwot jest równa budżetowi. `context-compressor.mjs` wyznacza budżet dopiero po pomiarze system+recent+pinned i outputReserve; przed przyjęciem streszczenia ponownie liczy rzeczywisty koszt za pomocą dostarczonego callbacku tokenizera. Streszczenie nie jest gwarancją zachowania semantyki historii; archiwum zawiera SHA256 i źródło.

## Wzory ze zdjęć / doprecyzowanie

Ze zrzutów użytkownika: `scaleFactor = containerWidth / deviceBreakpoint` i `adjustedHeight = containerHeight / scaleFactor`. Są użyteczne do skalowania w osi X, ale przy ograniczonej wysokości mogą powodować overflow. Produkcyjna implementacja rozszerza minimum o oś Y i cap 1: `scale=min(1, Wc/Wd, Hc/Hd)`. Wówczas `adjustedHeight=Hc/scale` to maksymalna widoczna logiczna wysokość we współrzędnych przed CSS transform, zaś obudowa ma rozmiar `Wd*scale` na `Hd*scale`.

Ze zrzutu tokenizacji: `T_segment_i = T_budget * w_i / sum_j(w_j)`. Jest to idealna proporcja, a nie dokładny koszt tokenów LLM. Implementacja kwantyzuje ją do liczb całkowitych z zachowaniem sumy. Zawartość systemowa i chroniona nie podlega kompresji; jeśli już przekracza budżet, działanie jest odrzucane. Alokacja nie zapewnia automatycznie semantycznej bezstratności ani oszczędności VRAM (to zależy od cache i backendu).

## Weryfikacja

Node 22.16.0 w Linux. Najpierw zapisano testy bez implementacji (RED: ERR_MODULE_NOT_FOUND), następnie zaimplementowano i uzyskano GREEN. Testy obejmują 12 nowych przypadków CAT-01..06, CTX-06..09, VIEW-06..07. Ponadto wykonano 5 testów odtwarzających wcześniejsze CTX-01..05. Komenda:

`cd locally-uncensored-enterprise && node --test test/next-increment.test.mjs test/legacy-context-regression.test.mjs` — 17/17 PASS, 0 FAIL/SKIP/CANCEL. SHA-256 pliku logu: `bf741e10bb16d67126344ce487ad954e0ed411fc2ce77138a6ddfca47aefa349`.

Kontrola składni `node --check` pięciu implementowanych modułów PASS. Do testów lokalnych dodano `legacy-context-regression.test.mjs` jako wyizolowany dowód historycznych CTX-01..05; oryginalny plik `backend/test/resource.test.mjs` nie był uruchamiany w całości.

Zakres NOT_RUN: pełny pnpm monorepo build, prawdziwa przeglądarka, realne 50k wierszy, Agent Registry i Model Manager z rzeczywistymi danymi, pomiar end-to-end tokenizera z modelem LLM/VRAM, trwałe backend/Temporal/pgvector, Tauri, Android i iOS. Testy nowego UI to mock DOM, nie browser E2E. Status ENT-41/42/43 PARTIAL, GATE-09 OPEN.
