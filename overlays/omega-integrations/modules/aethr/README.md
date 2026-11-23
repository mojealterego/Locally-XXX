# OMEGA-X GOD / AETHR — Engineering Delivery v1.0.0

Pełna dokumentacja: `docs/OMEGA_X_AETHR_Inzynieria_Wdrozenie.{pdf,docx,md}`.

- `REQUIREMENTS.csv`: 60 wymagań AETHR-001..060, bez sztucznego statusu PASS.
- `ADR.csv`: 12 rozstrzygnięć technicznych.
- `TEST_MATRIX.csv`: 28 scenariuszy (12 kontraktowych rodzin, 16 niewykonanych rzeczywistych E2E).
- `schemas/`: normatywne JSON Schema 2020-12 dla manifestu, routing request i zdarzeń.
- `src/oxa_ref/`: **wykonywalne kontrakty Python**, nie runtime LLM.
- `tests/`: 37 rzeczywiście uruchomionych testów jednostkowych i negatywnych.
- `evidence/`: log RED/GREEN, walidacja schematów i manifest SHA-256.

## Testy

```bash
python -m pip install -e '.[test]'
python -m pytest -q
PYTHONPATH=src python examples/demo_signed_oxa.py
```

## Security note

- `.oxa` nie jest samowystarczalnym plikiem wykonywalnym dla GPU, a podpis nie zapewnia szyfrowania.
- Zewnętrzny trust anchor jest obowiązkowy. Nigdy nie zapisuj prywatnych kluczy produkcyjnych w repozytorium.
- Nie interpretuj niezweryfikowanej TRS topologii jako kryptografii.
- Testy hostowe nie są testami Android/GPU ani pełnej inferencji.

## GitHub

Nie wykonano push do `Locally-XXX`. Artefakt do włączenia po przeglądzie i testach regresyjnych tylko na `main`.
