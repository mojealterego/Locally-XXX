# Aether Studio Ω — Autonomous Production Complex (AS-2026-PROD)

**Wydanie:** 1.0.0 | 23 listopada 2026 | **status:** wykonany i przetestowany lokalnie referencyjny control-plane, NIE gotowy AAA engine.

## Artefakty

- `docs/00_AETHER_STUDIO_MASTER.{md,docx,pdf}` — kompletna architektura, role CAG, pipeline, QA i GATE.
- `docs/01_NEUROBUS_API.{md,docx,pdf}` — protokół wiadomości NeuroBus Ultra.
- `docs/02_ADAPTIVE_AUDIO.{md,docx,pdf}` — Adaptive Orchestrator, muzyka zależna od dramaturgii.
- `docs/03_DIRECTOR_DASHBOARD.{md,docx,pdf}` — kontrola zmian reżyserskich, specyfikacja UX.
- `src/index.mjs`, `src/cli.mjs` — wykonywalny kod Node.js bez zewnętrznych zależności.
- `schemas/*.schema.json` — pięć lokalnych kontraktów JSON Schema Draft 2020-12.
- `examples/*.json` — cztery przykładowe wejścia do walidacji/uruchomienia.
- `tests/control.test.mjs`, `tests/schema.test.mjs` — uruchomione testy deterministyczne.
- `REQUIREMENTS.csv` — 64 wymagania; `ADR.csv` — 15 decyzji; `TEST_MATRIX.csv` — 34 scenariusze w tym **14 nieuruchomionych scenariuszy integracyjnych/E2E**.
- `INTEGRATION_DECISION.md` — rozdział odpowiedzialności z P10/QFV/Aether Engine.
- `evidence/` — logi RED/GREEN, demo CLI, walidacja i raport.
- `SHA256SUMS.txt` — integralność wszystkich dystrybuowanych plików z wyjątkiem manifestu.

## Uruchomienie bez chmury

Wymagany **Node.js >=22**. Nie są potrzebne instalacje Python/CUDA/GPU, nie ma pobierania zależności NPM.

```bash
npm test
node src/cli.mjs demo
node src/cli.mjs validate examples/project.json
node src/cli.mjs plan examples/project.json
node src/cli.mjs audio examples/audio.json
node src/cli.mjs narrative examples/narrative.json
```

Schemata przykładowe można sprawdzić za pomocą dodatkowej, opcjonalnej biblioteki Python `jsonschema==4.26.0`:

```bash
python -m pip install -r requirements-dev.txt
python verify_schemas.py
```

Uruchamialne funkcje: `createEnvelope` / `verifyEnvelope` (HMAC + TTL), `EventJournal` (lokalny zapis append + fsync + HMAC hash chain), `Workflow` (DAG i limity tokenów/compute), `compileIntentGraph` (**deterministyczne tagowanie, nie LLM**), `compileNarrative`, `decideNextScene`, `planAdaptiveAudio` (tylko planista przejść, nie generator audio), `changeDirectorSettings` i `authorizeAsset`.

### Ograniczenia bezpieczeństwa

Dziennik jest **single-writer** i nie chroni przed usunięciem całego pliku bez zewnętrznej kotwicy SHA/HMAC. Klucz HMAC powinien być przekazywany przez bezpieczną konfigurację; w przykładach jest wyłącznie edukacyjny. Brak transportu Zenoh/mTLS, zewnętrznego IAM, strumieniowania obrazu, realnego dashboardu, runnera renderującego i prawdziwego kompilatora AAA. Nie należy montować tych komponentów jako usług produkcyjnych bez wymienionych integracji i testów E2E.

### Stan GATE

- GATE-01…04: dostępna lokalna dokumentacja + ograniczone dowody testów.
- GATE-05…09: **niezaliczone** dla produkcyjnego produktu — brak realnych adapterów i wydania AAA.
- **GATE-09: BLOCKED**, repozytorium `Locally-XXX/main` pozostaje bez zmian.

## Licencje

Kod referencyjny pakietu oznaczony AGPL-3.0-only w kontekście integracji z Locally-XXX. Dane i nazwy cudzych produkcji wykorzystano wyłącznie jako opis wzorców i celów. Pakiet nie zawiera sesji aktorskich, prywatnych materiałów Quantic Dream, cudzej muzyki ani komercyjnych assetów 3D.
