# OMEGA-AOPT v1.0.0

Inżynieryjno-wdrożeniowa dokumentacja mechanizmów FlashAttention/MQA/GQA, Megatron TP/PP, ZeRO, FSDP2, BF16/FP8, LoRA/QLoRA. Architektura do selektywnej integracji z Locally-XXX.

## Zawartość

- `OMEGA_Attention_Distributed_Training_PEFT_Inzynieria_Wdrozenie.pdf` — dokument wydaniowy.
- `OMEGA_Attention_Distributed_Training_PEFT_Inzynieria_Wdrozenie.docx` — edytowalny oryginał.
- `OMEGA_Attention_Distributed_Training_PEFT_Inzynieria_Wdrozenie.md` — źródłowa specyfikacja.
- `INTEGRATION_DECISION.md` — co włączyć do Locally-XXX, a czego nie integrować natywnie.
- `schemas/` — JSON Schema profilu selektora.
- `reference/planner.py` — działający, deterministyczny walidator admission/polityk; nie uruchamia modeli.
- `tests/test_planner.py`, `verification/` — TDD RED/GREEN i logi.
- `examples/` — przykłady profilów GPU i Android.
- `SHA256SUMS.txt` — integralność zawartości archiwum.

## Uruchomienie testów

```bash
python -m unittest discover -s tests -v
python -m reference.planner examples/hopper_inference.json
python -m reference.planner examples/android_offline.json
```

**Stan:** Testy admission PASS. Brak fizycznych testów GPU, treningu PEFT, inferencji rzeczywistym modelem, bazy danych i integracji w repozytorium. GATE-09 OPEN.
