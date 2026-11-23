# OTCM – dokumentacja inżynieryjno-wdrożeniowa v1.0.0

- Pełny dokument: `docs/OTCM_Inzynieria_Wdrozenie.pdf` i `.docx` oraz `.md`
- Kryteria: `REQUIREMENTS.csv` (56), `ADR.csv` (14), `TEST_MATRIX.csv` (32)
- Kontrakty: `schemas/` (3 schematy JSON)
- Kod: `src/otcm_reference.py` — lokalny silnik czteroczasowych zdarzeń SQLite **bez** autentykacji użytkownika ani produkcyjnego OCX
- Testy: `python3 -m unittest discover -s tests -v`
- Dowody: `evidence/red.log`, `evidence/green.log`, `evidence/sha256.txt`
- Plan: `deploy/RUNBOOK.md`; integracja Locally-XXX: `docs/INTEGRATION_DECISION.md`

Stan: referencyjna implementacja działa lokalnie; silnik Rust, OCX, Android i pozostałe R&D pozostają niewdrożone. GATE-09 OPEN.
