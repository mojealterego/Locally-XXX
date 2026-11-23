# OMEGA P09 - Firefly Elements-like & Image/Video Editing Contracts v1.0.0

Pakiet jest **samodzielną referencyjną implementacją** wzorców funkcjonalnych, nie interfejsem API Adobe.

## Instalacja i testy

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[test]'
pytest -q
```

Zestaw obejmuje domeny: Elements, Video `elementReferences` i `@mentions`, korekcję Lab/HSL, MaskURI, 18 efektów, crop i retusz.
Bez zewnętrznych modeli: brak rozpoznawania obiektu, generowania widoków, generowania wideo i automatycznego mattingu.

## Status
- Implemented + host-tested: domenowe kontrakty, operacje CPU, walidacja, maskURI in-memory.
- Contract only: UI, automatyczna generacja widoków, backend video, quality gate tożsamości.
- Not integrated/deployed: Locally-XXX/main, Android, Vulkan/Metal, Adobe API.

Wszystkie pola `elementReferences`, `maskURI`, `tempA`, `tempB`, `tempLuminance` w schematach `omega.local` są własnymi kontraktami OMEGA; nie należy traktować ich jako publicznego API Adobe.

Pozostałe informacje: `docs/INTEGRATION_DECISION.md`, `TRACEABILITY_P09.csv` i `docs/OMEGA_P09_Inzynieria_Wdrozenie.md`.
