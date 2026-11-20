# Macierz deterministycznych testów symulacyjnych

Aktualizacja 2026-11-20. Wykonano 23 testy produkcyjnego kontrolera. SIM-PASS dotyczy zakresu ujętego w asercji i dowodach; PARTIAL oznacza brak implementacji lub pokrycia części kryterium. PHYSICAL NOT_RUN pozostaje niezależne.

| ID | Punkt | Symulowana granica | Asercja odbiorowa | ENGINEERING | PHYSICAL |
| --- | --- | --- | --- | --- | --- |
| SIM-RUN-01 | RUN-001 | Runner desktop/toolchain | Poprawna kolejność etapów, zatrzymanie na błędzie, brak fałszywego artefaktu | SIM-PASS | NOT_RUN |
| SIM-RUN-02 | RUN-001 | Brak zależności / timeout procesu | Kontrolowana odmowa, kod błędu, limit czasu i czyszczenie | SIM-PASS | NOT_RUN |
| SIM-RUN-03 | RUN-001 | Przerwany build | Powtarzalne wznowienie lub bezpieczny restart bez nadpisania zweryfikowanego artefaktu | SIM-PASS | NOT_RUN |
| SIM-AND-01 | AND-001 | Android ARM64 / WebView | Egzekwowanie ABI, walidacja ścieżek i kontraktów natywnych, odmowa niezgodnej konfiguracji | PARTIAL | NOT_RUN |
| SIM-AND-02 | AND-001 | System Android i uprawnienia | Odmowa bez uprawnień, kontrola cyklu życia, recovery po zabiciu procesu | PARTIAL | NOT_RUN |
| SIM-AND-03 | AND-001 | Model RAM / termika | Ograniczenie zasobów, kolejki, hysteresis, kontrolowane zwalnianie pamięci i backpressure | PARTIAL | NOT_RUN |
| SIM-GPU-01 | GPU-001 | Adapter inferencji GGUF / ComfyUI | Poprawny routing, walidacja odpowiedzi, brak fałszywego wyniku przy błędzie | SIM-PASS | NOT_RUN |
| SIM-GPU-02 | GPU-001 | OOM, GPU unavailable, timeout | Kontrolowana odmowa lub jawny fallback, limity retry, recovery | PARTIAL | NOT_RUN |
| SIM-GPU-03 | GPU-001 | Model pamięci generacji 8K | Budżet zasobów, bezpieczny podział pracy, czyszczenie niekompletnego wyniku | PARTIAL | NOT_RUN |

W przypadku każdego etapu lokalna kompilacja i test rzeczywistego kodu są preferowane, jeśli dostępne. Nieudostępnienie narzędzi lub wag nie jest zaliczeniem testu. Symulacja nie tworzy faktycznego APK, binarium desktop, obrazu 8K ani benchmarku sprzętu. Raport dowodowy powinien zawierać: requirement_id, test_id, source_sha, config, fixture_sha256, seed (jeżeli dotyczy), command, environment, exit_code, assertions, result, log_sha256, limitations. Kryterium nieadekwatne do rzeczywistego zakresu wymaga jawnego uzasadnienia NOT_APPLICABLE.

Pozostałe wymagania (MIG-003, MIG-004, SEC-002, RAG-001) również stosują VALIDATION_POLICY v2.0 w zakresie modelowalnych granic; rzeczywista weryfikacja dostępnych plików i zależności pozostaje obowiązkowa.

## Dowody i niepokryty zakres

Źródło: `scripts/runtime_control.py`, testy `tests/test_runtime_control.py`, `npm run test:runtime`: 23/23 PASS. [Raport z kontraktami, asercjami i SHA](evidence/RUN001-AND001-GPU001.json).

- **SIM-RUN-01 — SIM-PASS**: Build step ordering, first failure abort, missing output rejected. Process runner injected for application toolchain. Pozostało: No actual Tauri/React/Rust executable produced.
- **SIM-RUN-02 — SIM-PASS**: Real POSIX subprocess and timeout; simulated missing dependency/failure; evidence retained. Pozostało: No full toolchain installation.
- **SIM-RUN-03 — SIM-PASS**: Safe restart after early failure, preserved original failure log, rejection of stale dist. Pozostało: Hard kill leaving lock needs inspection; late failure needs fresh workspace.
- **SIM-AND-01 — PARTIAL**: Production APK ABI/ELF check; simulated Gradle/signature command and real flavor output layout; missing Android project denied. Pozostało: Native project, WebView, bridge, real signer identity and device compatibility remain open.
- **SIM-AND-02 — PARTIAL**: Capability and permission refusal; recovery from backend exception and release of process-local lease. Pozostało: Android system lifecycle, native permission handling and process-kill recovery not implemented/tested.
- **SIM-AND-03 — PARTIAL**: Process-local RAM reservation, stale sample denial, 43/39.5 C hysteresis, fail-closed backpressure and release. Pozostało: No continuous sensor monitoring, persistent cross-process broker or queue.
- **SIM-GPU-01 — SIM-PASS**: Actual loopback HTTP transport to fixture; llama-server route and simulated ComfyUI prompt/history/view contract, content validation. Pozostało: Trusted local backend/workflow required; no real model execution.
- **SIM-GPU-02 — PARTIAL**: Output budget refusal, bounded polling and no duplicate POST; no partial output published. Pozostało: No server-side cancellation, dynamic GPU memory admission, backend recovery/retry controller.
- **SIM-GPU-03 — PARTIAL**: 8K UHD valid deterministic RGB PNG fixture, CRC/size validation and atomic no-overwrite output; 16 B/px heuristic. Pozostało: No automatic tiling/stitching, model VRAM measurement, or actual AI 8K generation.
