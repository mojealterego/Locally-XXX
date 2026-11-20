# Enterprise Integrations Ω — file-converter, json-fmt, awesome-local-llm, stundensatz-rechner

Uruchomione komponenty w jednym launcherze; nie są osobnymi APK. Z katalogu locally-uncensored-enterprise:

    node --test integrations/test/integrations.test.mjs
    npm run build:web
    npm run start:web
    node integrations/bin/json-fmt.mjs pretty my.json
    node integrations/bin/json-fmt.mjs yaml my.json
    node integrations/bin/knowledge-cli.mjs inspect
    node integrations/bin/knowledge-cli.mjs search llama.cpp
    node integrations/bin/business-mcp.mjs

Konwerter: JPG, PNG, WebP na Canvas bez uploadu; brak PDF, HEIC, SVG (czekają na audyt dekoderów). JSON: format/minify/YAML/ENV, bez automatycznej naprawy składni. Stawki: uproszczony model podatku od zysku, bez VAT, wymaga samodzielnej korekty do kraju.

Knowledge: przypięty snapshot README i MIT LICENSE z PurpleDoubleD/awesome-local-llm SHA 713624bfc7e338da5cc5fb1c4ae9dfce70dc23f9. Kafelek wykonuje lokalny text-search. CLI inspect weryfikuje Git SHA źródła; search zwraca źródła i linie.

Opcjonalna indeksacja pgvector: działające PostgreSQL z RLS oraz lokalny Ollama /api/embed zwracający dokładnie 768 wymiarów. Ustaw OMEGA_CONFIRM_KNOWLEDGE_INDEX=YES, OMEGA_TENANT_ID, OMEGA_EMBEDDING_MODEL i bezpieczną konfigurację OMEGA_DB_* z backendu; dopiero wtedy jawnie uruchom 'node integrations/bin/knowledge-cli.mjs ingest'. Operacja zmienia bazę i NIE była uruchamiana w tej sesji.

Business MCP: transport stdio, protokół 2025-11-25, narzędzie estimate_freelance_hourly_rate. Nie połączono natywnie z OMAt/OCAF.

Dowody i znane ograniczenia: docs/OMEGA_ENT_EXTERNAL_INTEGRATIONS.md. Żaden przyrost nie otrzymał globalnego GATE-09.
