# OMEGA Enterprise — integracje czterech repozytoriów PurpleDoubleD

Data: 2026-11-21. Bazowy main: e28e57ca478fdf520df395b7c4927974915f887b. Wyłącznie main, bez płatnego CI.

## Weryfikacja upstream i prawa

| Repozytorium | Bazowy SHA | Licencja i zakres importu |
|---|---|---|
| PurpleDoubleD/file-converter | 97e148f006d04b75714b2f1b1fba2e27b1dfe89c | README deklaruje MIT, brak pliku LICENSE; kodu nie kopiowano. Oryginalny index.html odwołuje się do CDN. Niezależny konwerter JPG/PNG/WebP |
| PurpleDoubleD/json-fmt | 14402818c7c4ed8de50ada19376d1c4e00fb57b1 | LICENSE MIT, copyright 2026 Printer; niezależnie napisany formatter. Upstream npm test tylko wypisuje komunikat bez testów |
| PurpleDoubleD/awesome-local-llm | 713624bfc7e338da5cc5fb1c4ae9dfce70dc23f9 | README.md i LICENSE MIT (copyright 2025 rafska) skopiowane bez zmian do integracji; Git blobs: 132aabf970db777b3ec6d71949cb582e7f4035b7, 80a6d55ce6f3e2caa53617edad6f1d1a9acffe0c |
| PurpleDoubleD/stundensatz-rechner | 66550dc3fcf4829af998c8bfbb7aeb22d3d38a71 | Brak pliku LICENSE; bez kopiowania kodu; niezależna implementacja matematyki |

## Implementacja

ENT-37: integrations/src/converter.mjs i kafelek w launcherze. Canvas działa bez zewnętrznych API. Dekodowanie PDF/HEIC/SVG celowo zablokowane, nie zaimplementowane. Test nie uruchamiał przeglądarki.

ENT-38: integrations/src/json-tools.mjs oraz bin/json-fmt.mjs. Weryfikacja JSON, pretty, minify, YAML i ENV, limity i odrzucenie kolizji kluczy. Żadnych automatycznych poprawek kodu.

ENT-39: pełny snapshot MIT, browser text-search, chunker source SHA/cytowanie z numerami wierszy, parametryzowana transakcja w omega.rag_chunks i limit 768 wymiarów; lokalny adapter Ollama /api/embed. Części źródeł z Internetu są niezaufanymi danymi, a nie instrukcjami. Prawdziwy embedding PostgreSQL NOT_RUN.

ENT-40: lokalny kalkulator 52 tygodni, dochodu, kosztów, czasu i uproszczonej efektywnej stawki podatku (bez VAT); stdio JSON-RPC MCP 2025-11-25 z tools/list i tools/call. Nie jest to doradztwo podatkowe.

## Dowody lokalne

Node 22.16.0. Komenda: cd locally-uncensored-enterprise/integrations && node --test test/integrations.test.mjs. 16/16 PASS, 0 fail/skip/cancel. SHA256 lokalnego logu: 8a4c0de9c2e5676d391c68a6de534549a7094c8ab4d1fb4d2d5e7c03fc057eed.

JSON-01..03, PRICE-01..02, IMAGE-01..03 (mock canvas), RAG-01..05 (parametryzowany SQL na adapterze testowym i realny HTTP loopback z fikcyjną odpowiedzią Ollama), MCP-01..02 (subprocess), CLI-01 (subprocess). Node --check dla modułów PASS.

Nie wykonywano rzeczywistego browser E2E, instalacji React19, pełnego builda monorepo, PostgreSQL/pgvector, modelu embeddingowego, konwersji prawdziwych obrazów ani testów natywnego Androida. Previous suites NOT_RUN. Status ENT-37..40 PARTIAL i GATE-09 OPEN.

Źródła upstream pozostają bez modyfikacji. Zgodność AGPL-3.0 i licencjonowania zależności wymaga weryfikacji dystrybucji.
