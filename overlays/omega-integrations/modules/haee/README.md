# H.A.E.E. — dokumentacja inżynieryjno-wdrożeniowa v1.0.0

**Dokument źródłowy:** przekazany przez użytkownika opis silnika *Hyper-Adaptive Evolutionary Engine* (4 moduły: Genome, Selection Pressure, Recombination, Gödelian Observer).

**Decyzja integracyjna:** H.A.E.E. pozostaje samodzielnym, opcjonalnym silnikiem ewolucyjnym. Locally-XXX może korzystać z jego operatorów genomowych, selekcji Pareto, meta-obserwatora i selektywnej ewolucji, ale nie powinien duplikować istniejącego RSI/DGM/ShinkaEvolve ani pozwalać na autonomiczną modyfikację chronionej części systemu. Do repozytorium GitHub nie wprowadzono zmian.

## Pliki

- `HAEE_Inzynieria_Wdrozenie.pdf` — 13-stronicowa dokumentacja wdrożeniowa.
- `HAEE_Inzynieria_Wdrozenie.docx` — edytowalna dokumentacja.
- `HAEE_Inzynieria_Wdrozenie.md` — źródło tekstowe specyfikacji.
- `schemas/haee.genome.v1.schema.json` — weryfikowalny kontrakt grafu-genomu.
- `schemas/haee.experiment.v1.schema.json` — weryfikowalny kontrakt eksperymentu.
- `examples/{genome,experiment}.json` — zgodne przykłady danych.
- `tests/test_contracts.py` — 10 lokalnych testów kontraktowych (pozytywne i negatywne), nie testy runtime H.A.E.E.
- `build_contracts.py` — deterministyczne odtworzenie przykładów i schematów z dokumentacji.
- `SHA256SUMS.txt` — suma SHA-256 plików (bez samego manifestu).

## Weryfikacja lokalna

```bash
python -m unittest discover -s tests -v
# 10 testów PASS (schematy/kontrakty), Python 3 + jsonschema
```

**Nie wykonano:** kompilacji silnika w Rust, treningu modeli, testów na GPU, Android APK, integracji z DGM/ShinkaEvolve ani testów produkcyjnych. Wszystkie GATE-01..09 pozostają OPEN.
