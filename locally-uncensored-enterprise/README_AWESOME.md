# Awesome Enterprise Workspace Ω — lokalna integracja

**Status: ENT-47/48/49 PARTIAL.** Zintegrowana przestrzeń modułów — bez powielania istniejącego kodu i bez automatycznego wywoływania płatnych usług.

## ENT-47: Rejestr 10 modułów

Katalog `packages/awesome-workspace/` mapuje 10 nazw `awesome-*` na rzeczywiste, istniejące komponenty `backend/`, `integrations/`, `ide-studio/` i na nowe paczki. `OPEN` jest jawne, a `PARTIAL` oznacza tylko fragment kodu, nie status produkcyjny.

Z katalogu `locally-uncensored-enterprise`:
```sh
node packages/awesome-workspace/cli.mjs list
node packages/awesome-workspace/cli.mjs verify
```

Polecenie `verify` sprawdza fizyczną obecność przypisanych źródeł i brak symlinków. Wynik `ready=false` jest oczekiwany, dopóki wszystkie bramki nie zostaną faktycznie zaliczone. Launcher „Awesome Enterprise” wyświetla statusy, ograniczenia i otwiera tylko wcześniej dostępne moduły (knowledge, app builder, IDE, json, rates, reviews).

## ENT-48: Benchmarki lokalnego LLM

Tylko rzeczywiste żądania `http://127.0.0.1:<port>/api/chat`, bez możliwości dowolnego zewnętrznego URL. Benchmark jest **wyłączony, dopóki operator nie poda `--execute YES`**.

```sh
node packages/awesome-benchmarks/cli.mjs run --execute YES --model qwen:2b --prompt-file /tmp/public.txt --output /tmp/benchmark.json --samples 3 --port 11434 --hardware verified-host
node packages/awesome-benchmarks/cli.mjs compare --left /tmp/bench-a.json --right /tmp/bench-b.json
```

Wynik zapisuje TTFT, wall time, tokeny i tokens/s z pól odpowiedzi Ollama, SHA256 publicznego promptu, model i identyfikator środowiska (deklarowany przez operatora). Nie ma żadnych sztucznych liczb benchmarkowych. Porównania są oznaczone jako nieporównywalne przy innym prompt SHA, sprzęcie, źródle, parametrach lub niezweryfikowanym sprzęcie. **Nie mierzy jakości ani cen API**. W testach wykorzystano lokalny fixture HTTP, a nie fizyczny Ollama.

## ENT-49: Generator raportów HTML i PDF

```sh
node packages/awesome-printer-tools/cli.mjs html report.json report.html
node packages/awesome-printer-tools/cli.mjs pdf report.json report.pdf
```

Minimalny kontrakt JSON:
```json
{
  "title": "Raport OMEGA",
  "author": "Operator",
  "generatedAt": "2026-11-21T00:00:00Z",
  "sections": [
    {"heading": "Wyniki", "paragraphs": ["Opis wyniku pomiaru."]}
  ]
}
```

HTML jest statyczny z kodowaniem danych i CSP, bez pobierania zasobów sieciowych. PDF jest tworzony przez ReportLab 4.4.9 — `pip install -r packages/awesome-printer-tools/requirements.txt` — z lokalnym fontem Unicode (opcjonalnie `OMEGA_PDF_FONT_PATH`). **Plików fontów nie przechowujemy w repozytorium.** W stałym środowisku i przy tych samych danych PDF ma bajtowo identyczny wynik; wieloplatformowe gwarancje i podpisy nadal OPEN. Oba CLI odmawiają nadpisania istniejącego pliku. Raport nie jest niezależnym audytem ani certyfikatem.

## Walidacja

```sh
node --test test/awesome.test.mjs
```

Testy w Linux Node 22.16.0: **12/12 PASS**, w tym faktyczny lokalny HTTP fixture NDJSON, porównanie dwóch PDF byte-by-byte oraz `pdftotext` weryfikujący „Zażółć gęślą jaźń”, CLI oraz komponent DOM na kontrolowanym mocku. Przeglądarka, realny model, pełny pnpm monorepo, Windows/macOS/Android, Rust/Tauri oraz niezależny sandbox zostały **NOT_RUN**. [Dowody](../docs/OMEGA_ENT_AWESOME_EVIDENCE.md).

Żaden moduł nie uzyskuje GATE-09 na podstawie lokalnych testów jednostkowych.
