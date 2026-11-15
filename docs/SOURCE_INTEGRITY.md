# Materiały źródłowe — walidacja niezależna OMEGA-X

## Status

W docelowym `Locally-XXX/main` pełna materializacja 1112 plików Locally Uncensored pozostaje **nieukończona**. Submoduł `upstream/locally-uncensored` zawiera przypięty commit `6d96ab92e827e0471586c6291c78067b495ef44a`; zdalny indeks `docs/UPSTREAM_FILE_INDEX.json` zawiera metadane plików ze źródłowego drzewa Git.

## Operacje w Termux / Linux / macOS / Windows (Node >=22)

```bash
git submodule update --init --recursive
npm run verify:source
npm run vendor:dry
npm run vendor:apply
npm run vendor:check
npm run vendor:verify-pinned
```

`vendor:check` jest walidatorem własnego manifestu. `vendor:verify-pinned` jest silniejszym niezależnym walidatorem: porównuje manifest z indeksem GitHub przypiętym do commita, weryfikuje bajty SHA-1 Git + SHA-256 każdego pliku, odrzuca brakujące, nieznane i podmienione wpisy oraz dodatkowe pliki i dowiązania symboliczne. Nie stosuje pobierania sieciowego.

Po dokonaniu kopii `vendor/` należy wykonać `vendor:verify-pinned` **przed** instalacją `node_modules` lub generowaniem plików build — walidacja jest ściśle deterministyczna i odrzuca także dodatkowe pliki narzędziowe. Następnie dopiero `git add`, commit i niezależne sprawdzenie świeżego klonu.

Brak błędów walidacji nie dowodzi działania modelu, inferencji, uruchomienia UI ani zbudowania APK. Sprawdza integralność kopiowanych plików źródłowych przy założeniu zaufanego checkoutu indeksu GitHub. Sprawdzenie źródłowego commita nie jest mechanizmem kryptograficznego podpisu autora.

## Ograniczenia i ochrona

- Nie importować automatycznie danych z prywatnego repozytorium `mojealterego/Omega-XXX-Absolute` do publicznego `Locally-XXX`.
- Każda publikacja modeli, archiwów i narzędzi wymaga kontroli licencji i sekretów.
- Kopiowanie z publicznego upstream zachowuje oryginalną AGPL-3.0-only i informację o autorstwie.
- Ochrona symlinków, limit rozmiaru i walidacja hashów ograniczają ryzyko, ale w katalogu modyfikowanym równolegle przez złośliwy proces nie gwarantują pełnej odporności na TOCTOU.
- Dla dużej kopii i modeli trzeba monitorować zajętość dysku oraz ewentualne koszty GitHub LFS.
