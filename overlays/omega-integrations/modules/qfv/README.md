# QFV — Moduł 11 / Silnik Animacji i Odkształceń Wektorowych

Wersja 1.0.0 — osobna dokumentacja inżynieryjno-wdrożeniowa + testowany Python reference core.

- Dokumentacja: `docs/QFV_Inzynieria_Wdrozenie.{md,docx,pdf}`.
- Integracja: `docs/INTEGRATION_DECISION.md`; ryzyka: `docs/THREAT_MODEL.md`.
- 54 wymagania `REQUIREMENTS.csv`, 14 decyzji `ADR.csv`, macierz `TEST_MATRIX.csv`.
- Kod: `src/qfv/engine.py` (biblioteka bez zależności), `tests/test_qfv.py` (unit), `examples/demo.py`.
- Kontrakty: `contracts/*.schema.json` (2020-12), przykłady JSON.
- Dowody: `evidence/RED.txt`, `GREEN.txt`, `CONTRACTS.txt`, `ENVIRONMENT.txt`, manifest checksums.

Uruchomienie z korzenia katalogu:

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
PYTHONPATH=src python examples/demo.py
```

Status: host reference TESTED; Rust/Android/Adobe E2E NIE WDROŻONO. Nie zmieniono `Locally-XXX/main`.
