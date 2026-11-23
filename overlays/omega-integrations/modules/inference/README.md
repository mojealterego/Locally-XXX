# OMEGA INFERENCE ENGINES — v1.0.0

Kompletny, samodzielny pakiet dokumentacji inżynieryjno-wdrożeniowej silników inferencyjnych.

## Główne artefakty

- `INFERENCE_ENGINES_Inzynieria_Wdrozenie.pdf` — wersja do czytania, numerowane strony.
- `INFERENCE_ENGINES_Inzynieria_Wdrozenie.docx` — edytowalny dokument techniczny.
- `INFERENCE_ENGINES_Inzynieria_Wdrozenie.md` — źródłowa specyfikacja z tabelami.
- `INTEGRATION_DECISION.md` — decyzja doboru silników do Locally-XXX (selektywna integracja).
- `schemas/` — JSON Schema 2020-12 i demonstracyjny request.
- `reference/inference_router.py` — działająca deterministyczna funkcja wyboru instancji, bez zależności sieciowych.
- `tests/` — testy jednostkowe routingu i walidacji schematów.
- `evidence/host_contract_tests.log` — rzeczywiste wyniki testów.
- `SHA256SUMS.txt` — hash wszystkich plików pakietu.

## Weryfikacja

```bash
python3 -m pip install 'jsonschema>=4.20,<5'
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 -m json.tool schemas/runtime_capabilities.schema.json >/dev/null
python3 -m json.tool schemas/inference_request.schema.json >/dev/null
python3 -m json.tool schemas/inference_request.example.json >/dev/null
sha256sum -c SHA256SUMS.txt
```

## Stan

- Specyfikacja: opracowana.
- Referencyjny router i schematy: przetestowane lokalnie.
- Integracje produkcyjne vLLM/SGLang/TRT-LLM/llama.cpp/MNN itd.: nie wdrażano ani nie testowano w tym pakiecie.
- Android/Cloud-HPC E2E: NOT_RUN.
- Zmiany w repozytorium `Locally-XXX/main`: nie wykonywano.
- GATE-09: OPEN.
