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

## Niezależna kopia źródeł (materializacja)

Po zainicjalizowaniu submodułu można wygenerować pełną, bajtowo zweryfikowaną kopię wszystkich plików śledzonych w Git w katalogu `vendor/locally-uncensored`:

```bash
npm run vendor:dry
npm run vendor:apply
npm run vendor:check
```

Importer sprawdza SHA-1 obiektów Git, SHA-256 skopiowanych plików, odrzuca dowiązania symboliczne i nie nadpisuje istniejącej zmodyfikowanej kopii. Tworzy manifest `.omega-source-manifest.json`. Dopóki katalog `vendor/` nie został rzeczywiście wygenerowany, dodany do Git i niezależnie sprawdzony, pełna kopia **nie znajduje się w tym repozytorium**. Po materializacji można uruchomić aplikację bez submodułu bezpośrednio z `vendor/locally-uncensored` (po instalacji zależności).

**Nie uruchomiono automatycznie GitHub Actions.** Oryginalne workflow są zachowane jako nieaktywne pliki pod `docs/upstream-workflows-disabled/` i nie są wykonywane w tym repozytorium.

## Zakres i ograniczenia

- Baza to **desktop Tauri + React + Rust**. Nie stanowi aplikacji Android ani gotowego APK.
- Komponenty OMEGA-X i archiwa z `Omega-XXX-Absolute` wymagają odrębnego przeglądu licencji, integralności i sekretów przed publikacją; repozytorium źródłowe jest prywatne, a niniejsze publiczne.
- Do ukończenia migracji potrzebna jest materializacja pełnych plików źródłowych i niezależne porównanie ich SHA-256. Submoduł jest odtwarzalnym, przypiętym punktem startowym, **nie pełną migracją**.
- Testy deterministyczne nie zastępują sprzętowych testów Android, GPU ani produkcyjnego E2E.

Zobacz [roadmapę](docs/ROADMAP.md) i [macierz weryfikacji](docs/TEST_MATRIX.md).
