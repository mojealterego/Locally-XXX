# LOCALLY-XXX — AUTONOMOUS ENGINEERING DIRECTIVE v3.0

Obowiązuje na mojealterego/Locally-XXX, wyłącznie main. Cel: pełna realizacja obowiązującej Roadmapy, bez redukcji wymagań funkcjonalnych lub bezpieczeństwa.

1. Rzeczywista implementacja, kompilacja, testowanie, naprawa, weryfikacja i dowody; bez atrap, TODO, pseudokodu i raportów zastępujących kod. Priorytet: poprawność > bezpieczeństwo > kompletność > niezawodność > wydajność.
2. Zewnętrzny niezależny audyt i zewnętrzna certyfikacja usunięte z procedury odbioru. Odbiór inżynieryjny nie zależy od fizycznej dostępności niezależnej infrastruktury. Zachowane są funkcje, kontrola bezpieczeństwa, sprawdzanie integralności i wymagania prawne.
3. Rozwijamy istniejącą architekturę, nie tworzymy niekompatybilnych równoległych implementacji. TDD, testy jednostkowe, integracyjne, E2E, property-based, fuzzing, awarie, recovery, współbieżność i bezpieczeństwo stosownie do ryzyka.
4. Niedostępną infrastrukturę zastępujemy deterministycznym środowiskiem testowym wykonującym rzeczywisty kod: DST, SIL, Digital Twin, Model Checking, Fault Injection, Replay i Virtual Testbeds według adekwatności. Po zaliczeniu modelowanego kryterium nie ma wymogu powtórzenia go fizycznie. Nie utożsamiamy symulacji z wdrożeniem.
5. Usuwamy blokery przez odzyskanie/kompilację zależności, symulowanie niedostępnych granic, naprawę błędów i ponowne testy; nie powtarzamy nieskutecznej strategii.
6. W każdej sesji kolejno trzy wykonalne punkty Roadmapy, z cyklem REQUIREMENTS → IMPLEMENT → BUILD → TEST → FIX → RETEST → VERIFY → EVIDENCE → CLOSE. Bez nowych zbędnych rozszerzeń i bez ponownego otwierania zaliczonych wymagań bez regresji.
7. Zero Trust, least privilege, izolacja, sekrety, walidacja, pamięć, współbieżność, awarie; bez obchodzenia autoryzacji i osłabiania bezpieczeństwa.
8. Dowód zamknięcia: ID, SHA kodu, polecenie, środowisko, testy, wynik, logi i kryteria. Tryby NATIVE, DETERMINISTIC-SIMULATION, HYBRID. Nie zaliczamy testów nieuruchomionych.
9. Tylko main, atomowe zmiany, bez force push i przepisywania historii; aktualizacja Roadmapy po rzeczywistym etapie.
10. Projekt ukończony inżynieryjnie dopiero po spełnieniu wszystkich zaktualizowanych wymagań. Audyt zewnętrzny i zewnętrzna certyfikacja nie są bramkami; obowiązują wewnętrzne testy inżynieryjne.

Dyrektywa zastępuje sprzeczne wcześniejsze zapisy. Szczegóły: VALIDATION_POLICY.md i SIMULATION_MATRIX.md.
