# OMEGA OMNIVERSE STUDIO Ω — P10

**Unified Cinema / Children's Animation / Game Cinematics / AAA World Architect**

Zintegrowany pakiet inżynieryjno-wdrożeniowy dla `mojealterego/Locally-XXX`, gałąź docelowa `main`. Zakres źródłowy pochodzi z dokumentu użytkownika przesłanego 22.11.2026. Rozdziela cztery tracki produkcji, 204 role w 13 pionach, metadata i filmowy timebase, graf rozgałęzień, streaming świata i planowanie geodezyjne.

## Start

Wymagany **Node.js >= 22**, standard library, bez sieci i zależności zewnętrznych:

```bash
npm test
npm run demo
npm run demo:world
node src/cli.mjs export-cinematic examples/project_cinematic.json GODOT
node src/cli.mjs export-world examples/project_world.json UNREAL
node src/cli.mjs route examples/project_world.json w-0 w-3
node src/cli.mjs plan examples/project_film.json
```

## Wersja i status

| Składnik | Status |
| --- | --- |
| `src/core.mjs`: walidacja projektu, 4 tracki, crew, audience, child compliance checklist | IMPLEMENTED_REFERENCE |
| `src/core.mjs`: shot manifests, task DAG, narrative DAG + QTE fail-forward | IMPLEMENTED_REFERENCE |
| `src/core.mjs`: world tile budget selection, content hash, audit chain | IMPLEMENTED_REFERENCE |
| `src/geodesic.mjs`: dyskretna geodezja na grafie sąsiednich komórek | IMPLEMENTED_REFERENCE |
| `src/interchange.mjs`: neutralne manifesty Godot / Unreal | IMPLEMENTED_REFERENCE (no plugins) |
| `src/roles.mjs`: katalog 204 nazw ról z dostarczonego dokumentu | IMPLEMENTED_REFERENCE |
| `docs/00_MASTER...`: architektura i roadmap | SPECIFIED |
| Render/NLE/mocap/animacja/3D/Vulkan/Android APK/komercyjne usługi | NOT_IMPLEMENTED |
| Integracja do `Locally-XXX/main` | NOT_PERFORMED (standalone delivery) |

Żaden z lokalnych testów nie jest testem E2E na Galaxy S24 Ultra ani dowodem produkcyjnego renderingu. Manifesty Godot i Unreal są własnym formatem pośrednim do przyszłych adapterów. Przykładowe nazwy i hashe to fikcyjne fixtures — **nie załadowane assety rzeczywiste**.

## Struktura

```text
src/          minimalny wykonywalny rdzeń referencyjny (Node.js ESM)
tests/        testy kontraktowe i bezpieczeństwa
examples/     4 typowe produkcje
schemas/      wersjonowane schematy JSON
crew_roles.csv, crew_roles.json  taksonomia stanowisk
docs/         master + 4 odrębne dokumentacje PDF/DOCX/Markdown
evidence/     wyniki testów, kontrola plików, SHA-256
```

## Bezpieczeństwo

Pakiet nie przesyła danych, nie zawiera zewnętrznego API i nie uruchamia AI. Nie wykonuje weryfikacji zgody ani uprawnień pracowniczych; flagi są przeznaczone wyłącznie do zatrzymania workflow i poddania sprawy przeglądowi człowieka. Treści dla dorosłych są ściśle odseparowane od produkcji dziecięcych. Bramka wydania wymaga praw/licencji, QC i zgody człowieka. Docelowa integracja z repozytorium AGPL wymaga osobnego audytu licencji i zgodności manifestów.

## Dokumenty

1. `docs/00_MASTER_INTEGRATION.pdf` — architektura, 4 ścieżki, GATE-01..09
2. `docs/01_FILM_STUDIO.pdf` — film, serial, dokument, ekipy, DIT, postprodukcja
3. `docs/02_CHILD_ANIMATION.pdf` — animacja dziecięca, edukacja i safeguarding
4. `docs/03_GAME_CINEMATICS.pdf` — narracyjne cutscenki, performance capture, QTE
5. `docs/04_AAA_WORLD_ARCHITECT.pdf` — planowanie świata, topologia, streaming, geodezja

## Prawa i licencje

Opracowanie własne P10 bazujące na wymaganiach dostarczonych przez użytkownika; brak kopiowanego kodu z Quantic Dream, Adobe, Unreal Engine ani Godot. `package.json` ma `UNLICENSED` do czasu podjęcia decyzji o przeniesieniu do repozytorium nadrzędnego AGPL-3.0-only. Przy realnym scaleniu należy uzupełnić pliki licencyjne i informacje o autorstwie zgodnie z polityką upstream.
