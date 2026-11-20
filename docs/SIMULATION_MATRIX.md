# Macierz deterministycznych testów symulacyjnych

Aktualizacja 2026-11-20. 30 nowych testów, 258 unikatowych regresji. Dyrektywa v3.0: SIM-PASS zamyka modelowany zakres bez fizycznego powtórzenia; PARTIAL oznacza niepokryty kod lub kontrakt.

| ID | Punkt | Symulowana granica | Asercja odbiorowa | ENGINEERING | PHYSICAL |
| --- | --- | --- | --- | --- | --- |
| SIM-RUN-01 | RUN-001 | Runner desktop/toolchain | Poprawna kolejność etapów, zatrzymanie na błędzie, brak fałszywego artefaktu | SIM-PASS | NOT_RUN |
| SIM-RUN-02 | RUN-001 | Brak zależności / timeout procesu | Kontrolowana odmowa, kod błędu, limit czasu i czyszczenie | SIM-PASS | NOT_RUN |
| SIM-RUN-03 | RUN-001 | Przerwany build | Powtarzalne wznowienie lub bezpieczny restart bez nadpisania zweryfikowanego artefaktu | SIM-PASS | NOT_RUN |
| SIM-AND-01 | AND-001 | Android ARM64 / WebView | Egzekwowanie ABI, walidacja ścieżek i kontraktów natywnych, odmowa niezgodnej konfiguracji | PARTIAL | NOT_RUN |
| SIM-AND-02 | AND-001 | System Android i uprawnienia | Odmowa bez uprawnień, kontrola cyklu życia, recovery po zabiciu procesu | PARTIAL | NOT_RUN |
| SIM-AND-03 | AND-001 | Model RAM / termika | Ograniczenie zasobów, kolejki, hysteresis, kontrolowane zwalnianie pamięci i backpressure | SIM-PASS | NOT_RUN |
| SIM-GPU-01 | GPU-001 | Adapter inferencji GGUF / ComfyUI | Poprawny routing, walidacja odpowiedzi, brak fałszywego wyniku przy błędzie | SIM-PASS | NOT_RUN |
| SIM-GPU-02 | GPU-001 | OOM, GPU unavailable, timeout | Kontrolowana odmowa lub jawny fallback, limity retry, recovery | SIM-PASS | NOT_RUN |
| SIM-GPU-03 | GPU-001 | Model pamięci generacji 8K | Budżet zasobów, bezpieczny podział pracy, czyszczenie niekompletnego wyniku | SIM-PASS | NOT_RUN |

W przypadku każdego etapu lokalna kompilacja i test rzeczywistego kodu są preferowane, jeśli dostępne. Nieudostępnienie narzędzi lub wag nie jest zaliczeniem testu. Symulacja nie tworzy faktycznego APK, binarium desktop, obrazu 8K ani benchmarku sprzętu. Raport dowodowy powinien zawierać: requirement_id, test_id, source_sha, config, fixture_sha256, seed (jeżeli dotyczy), command, environment, exit_code, assertions, result, log_sha256, limitations. Kryterium nieadekwatne do rzeczywistego zakresu wymaga jawnego uzasadnienia NOT_APPLICABLE.

Pozostałe wymagania (MIG-003, MIG-004, SEC-002, RAG-001) również stosują VALIDATION_POLICY v3.0 w zakresie modelowalnych granic; rzeczywista weryfikacja dostępnych plików i zależności pozostaje obowiązkowa.

## Dowody i niepokryty zakres

Źródło: `scripts/runtime_control.py`, testy `tests/test_runtime_control.py`, `npm run test:runtime`: 23/23 PASS. [Raport z kontraktami, asercjami i SHA](evidence/RUN001-AND001-GPU001.json).

- **SIM-RUN-01 — SIM-PASS**: Build step ordering, first failure abort, missing output rejected. Process runner injected for application toolchain. Pozostało: No actual Tauri/React/Rust executable produced.
- **SIM-RUN-02 — SIM-PASS**: Real POSIX subprocess and timeout; simulated missing dependency/failure; evidence retained. Pozostało: No full toolchain installation.
- **SIM-RUN-03 — SIM-PASS**: Safe restart after early failure, preserved original failure log, rejection of stale dist. Pozostało: Hard kill leaving lock needs inspection; late failure needs fresh workspace.
- **SIM-AND-01 — PARTIAL**: istniejące bramki ABI/ELF/podpisu i inicjalizacji rozszerzone o rzeczywisty kod Kotlin MainActivity Tauri 2.10.1, instalator nakładki oraz kontrolę backup i pełnej nazwy klasy launchera w końcowym APK. Kotlin/JVM kompilacja i testy modelowanego SDK PASS. Brak natywnego Rust mobile entrypoint i działającego WebView IPC; fizyczne powtórzenie zaliczonych właściwości nie jest wymagane.
- **SIM-AND-02 — PARTIAL**: natywny trwały checkpoint Activity (SharedPreferences, commit), identyfikator procesu i fencing generacji, testy odtworzenia checkpointu, błędu zapisu i niedozwolonego ABI na JVM, istniejący test SIGKILL brokera i ADB. Latch recoveryRequired sygnalizuje konieczność uzgodnienia, nie odtwarza sam sesji i nie zwalnia rezerwacji GPU. Brak integracji IPC/recovery stanu aplikacji.
- **SIM-AND-03 — SIM-PASS (kontrola dopuszczenia)**: trwała kolejka FIFO, transakcje SQLite, monitor jednego właściciela, rezerwa 1024 MiB, histereza 43/39.5 C, ważność próbki 10 s, kontrola deadline i zwolnienie/recovery. Nie przerywa działającego GPU; rzeczywisty sensor i pamięć urządzenia NOT_RUN.
- **SIM-GPU-01 — SIM-PASS**: Actual loopback HTTP transport to fixture; llama-server route and simulated ComfyUI prompt/history/view contract, content validation. Pozostało: Trusted local backend/workflow required; no real model execution.
- **SIM-GPU-02 — SIM-PASS (HYBRID, dedykowany backend/fail-closed dla współdzielonego)**: istniejące retry, checkpointy i broker z rzeczywistym nadzorem potomka, potwierdzeniem właściciela socketu, ograniczonym restartem na znanej granicy, bez replay niepewnego POST. Przerwanie aktywnej pracy wyłącznie przez zatrzymanie własnego dedykowanego procesu; obcy proces i niepewne anulowanie pozostają fail-closed. Rzeczywiste SIGKILL, restart i 6/6 odrębnych POST w lokalnym testbedzie ComfyUI. PHYSICAL jest informacyjne.
- **SIM-GPU-03 — SIM-PASS (upscaling referencyjny i strumieniowe scalanie)**: produkcyjny planer o ograniczonej liczbie kafli, adaptacja rdzenia do oszacowania buforów, nakładki z całkowitoliczbowym featheringiem, rzeczywisty RGB PNG 7680×4320 z 40 kafli, atomowy zapis, recovery po przerwaniu i odmowa zmienionego wejścia. Backend ComfyUI symulowany (najbliższy sąsiad/fixtures); rzeczywiste wagi, generacja dyfuzyjna, VRAM i Android NOT_RUN. Estymata buforów nie jest limitem całkowitego RSS.

Przyrost: `npm run test:broker` 13/13, `npm run test:recovery` 11/11; razem 166 testów regresji. [Dowody](evidence/AND001-GPU001-RECOVERY.json).

Przyrost tiled upscale: `npm run test:tiled` 20/20, pełna regresja 186/186. Dwa pomiary rzeczywistego scalania na Linux dały identyczne SHA-256. [Dowody](evidence/GPU001-TILED-8K.json).

Przyrost managed GPU: `npm run test:managed-gpu` (16 testów; równoważne polecenie unittest wykonane lokalnie). Pełna regresja 202/202. [Dowody](evidence/GPU001-MANAGED.json).

Przyrost v3.0: `npm run test:native-acceptance` 14/14, `npm run test:advisories` 12/12; pełna regresja 228/228. [Raport i logi](evidence/V3-ACCEPTANCE.json). Wszystkie wcześniej zaliczone bramki pozostają bez zmian.

Przyrost AND/RAG/SEC: 8 Python Android overlay + 8 Kotlin/JVM + 6 Node RAG + 8 Python lockfile = 30 nowych. 258/258 pełnej regresji. [Raport](evidence/ANDROID-RAG-SEC-INTEGRATION.json). Pełne surowe logi z hashami raportu są w paczce przyrostu; nie wprowadzono nieuruchomionych PASS.
