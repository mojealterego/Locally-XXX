# OMEGA Enterprise — dowody ENT-47/48/49

Data: 2026-11-21. Baza repozytorium `mojealterego/Locally-XXX` main: `45a4f57c2e1c7bb51676d9fd0a13992016077510`. Prace addytywne, tylko main, bez force push i płatnego GitHub Actions.

## Zawartość przyrostu

- ENT-47: `packages/awesome-workspace/{definitions,registry,browser,cli}.mjs`; 10 logicznych nazw `awesome-*` o źródłowych ścieżkach już istniejącego kodu lub jawnie OPEN. `awesome-opensource-app` OPEN (natywny build nie istnieje w enterprise package). Zredukowany launcher umożliwia otwarcie wyłącznie wcześniej istniejących modułów.
- ENT-48: `packages/awesome-benchmarks/{benchmark,cli}.mjs`; klient tylko `127.0.0.1:<port>/api/chat` (Ollama), limit 20 próbek, 1 MiB response, 30s domyślny timeout, `--execute YES`, SHA promptu, metryki eval_count/eval_duration i lokalny TTFT. `compareObservations` odrzuca niezgodne warunki i sprzęt `unverified`. Brak rzeczywistego modelu lub komercyjnego API podczas testów.
- ENT-49: `packages/awesome-printer-tools/{html.mjs,pdf_report.py,cli.mjs}`; raporty offline HTML i PDF z polskim Unicode, brak fontów w repo. Walidacja JSON, CSP, statyczny tekst w HTML. ReportLab ze stałym trybem invariant i lokalnym fontem DejaVu Sans. CLI z zabezpieczeniem przed nadpisaniem istniejących plików.

## Testy rzeczywiście wykonane

Komenda: `cd locally-uncensored-enterprise && node --test test/awesome.test.mjs`.

- RED: przed napisaniem implementacji potwierdzony błąd `ERR_MODULE_NOT_FOUND`.
- GREEN: **12/12 PASS**, 0 fail/skip/cancel. Linux Node `v22.16.0`, Python 3, ReportLab `4.4.9`, pdftotext i pdftoppm dostępne.
- Dowód logu lokalnego `green_final.log` SHA-256: `ddb0671b9b66a0b608ebaae79181c1472331fe8d3aebae2ca709fa354c577bf4`.
- Testy AW-01..04: 10 statusów, CLI, weryfikacja pustego repo, mock DOM i routing.
- BM-01..03: prawdziwy serwer HTTP loopback z syntetyczną odpowiedzią zgodną ze schematem Ollama, błędne NDAJSON, kontrola nierzetelnych warunków porównania. Mierzone metryki benchmarku są **fixture**, nie wynikiem prawdziwego modelu.
- PR-01..05: escaping/CSP, ograniczenie wielkości, walidacja daty, rzeczywisty subprocess `python3` i wygenerowane PDF, dwa pliki byte-identical, `pdftotext` potwierdził `Zażółć gęślą jaźń` oraz jedno-stronicowy rendering A4 bez clippingu.
- Kontrola `node --check` i `python -m py_compile` dla nowych modułów PASS.

## Ograniczenia odbioru

W tej sesji **NIE** uruchomiono pełnej kompilacji pnpm, wszystkich wcześniejszych suite, browser E2E, UI natywnego, rzeczywistego Ollama na sprzęcie, testów platform Windows/macOS/Android, sandboxu Firecracker/gVisor, Keycloak, pgvector, Temporal i RAG wektorowego. HTTP fixture nie jest realną inferencją. Layout PDF jest minimalistyczny, nie stanowi dokumentu certyfikacyjnego. Status ENT-47/48/49 **PARTIAL**, wszystkie globalne bramki finalnego odbioru pozostają OPEN.

Nie tworzono sekretów w repozytorium, nie kopiowano kodu z obcych repozytoriów, nie umieszczano fontów w commitach.
