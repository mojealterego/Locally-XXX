# Macierz deterministycznych testów symulacyjnych

Stan początkowy: 2026-11-19. Wiersze są kryteriami odbioru, **nie wynikami uruchomionych testów**. Status początkowy SIM_REQUIRED / PHYSICAL NOT_RUN. Testy mają wykonywać produkcyjny komponent, z kontrolowanym adapterem wyłącznie dla niedostępnej infrastruktury.

| ID | Punkt | Symulowana granica | Asercja odbiorowa | ENGINEERING | PHYSICAL |
| --- | --- | --- | --- | --- | --- |
| SIM-RUN-01 | RUN-001 | Runner desktop/toolchain | Poprawna kolejność etapów, zatrzymanie na błędzie, brak fałszywego artefaktu | SIM_REQUIRED | NOT_RUN |
| SIM-RUN-02 | RUN-001 | Brak zależności / timeout procesu | Kontrolowana odmowa, kod błędu, limit czasu i czyszczenie | SIM_REQUIRED | NOT_RUN |
| SIM-RUN-03 | RUN-001 | Przerwany build | Powtarzalne wznowienie lub bezpieczny restart bez nadpisania zweryfikowanego artefaktu | SIM_REQUIRED | NOT_RUN |
| SIM-AND-01 | AND-001 | Android ARM64 / WebView | Egzekwowanie ABI, walidacja ścieżek i kontraktów natywnych, odmowa niezgodnej konfiguracji | SIM_REQUIRED | NOT_RUN |
| SIM-AND-02 | AND-001 | System Android i uprawnienia | Odmowa bez uprawnień, kontrola cyklu życia, recovery po zabiciu procesu | SIM_REQUIRED | NOT_RUN |
| SIM-AND-03 | AND-001 | Model RAM / termika | Ograniczenie zasobów, kolejki, hysteresis, kontrolowane zwalnianie pamięci i backpressure | SIM_REQUIRED | NOT_RUN |
| SIM-GPU-01 | GPU-001 | Adapter inferencji GGUF / ComfyUI | Poprawny routing, walidacja odpowiedzi, brak fałszywego wyniku przy błędzie | SIM_REQUIRED | NOT_RUN |
| SIM-GPU-02 | GPU-001 | OOM, GPU unavailable, timeout | Kontrolowana odmowa lub jawny fallback, limity retry, recovery | SIM_REQUIRED | NOT_RUN |
| SIM-GPU-03 | GPU-001 | Model pamięci generacji 8K | Budżet zasobów, bezpieczny podział pracy, czyszczenie niekompletnego wyniku | SIM_REQUIRED | NOT_RUN |

W przypadku każdego etapu lokalna kompilacja i test rzeczywistego kodu są preferowane, jeśli dostępne. Nieudostępnienie narzędzi lub wag nie jest zaliczeniem testu. Symulacja nie tworzy faktycznego APK, binarium desktop, obrazu 8K ani benchmarku sprzętu. Raport dowodowy powinien zawierać: requirement_id, test_id, source_sha, config, fixture_sha256, seed (jeżeli dotyczy), command, environment, exit_code, assertions, result, log_sha256, limitations. Kryterium nieadekwatne do rzeczywistego zakresu wymaga jawnego uzasadnienia NOT_APPLICABLE.

Pozostałe wymagania (MIG-003, MIG-004, SEC-002, RAG-001) również stosują VALIDATION_POLICY v2.0 w zakresie modelowalnych granic; rzeczywista weryfikacja dostępnych plików i zależności pozostaje obowiązkowa.
