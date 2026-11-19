# OMEGA-X — zasady odbioru i walidacji v2.0

Obowiązuje od 2026-11-19. Polityka jest nadrzędna wobec wcześniejszych zapisów Roadmapy i historycznych macierzy testów.

## Dyrektywa odbioru bez niezależnej infrastruktury

Jeżeli realizacja wymagania zależy od niedostępnej infrastruktury zewnętrznej lub niezależnej (urządzenia Android, GPU/NPU, zdalne serwery, chmury, usługi API, runner CI), podstawą odbioru inżynieryjnego są **deterministyczne testy symulacyjne**. Nie wymagamy niezależnego audytora ani uruchamiania płatnego CI. Niedostępność infrastruktury nie blokuje implementacji i weryfikacji właściwości możliwych do modelowania.

Implementacja produkcyjna nadal jest obowiązkowa. Symulacja zastępuje niedostępny element otoczenia testowego, a nie implementowany komponent. Test ma wykonywać rzeczywisty kod komponentu, o ile jest to wykonalne, z jawnie modelowanymi adapterami infrastruktury. Model bez połączenia z rzeczywistym komponentem może stanowić dowód właściwości modelu, nie implementacji.

## Dwa niezależne wymiary odbioru

- ENGINEERING: NOT_RUN, FAIL, BLOCKED, PASS, SIM-PASS, NOT_APPLICABLE. SIM-PASS zamyka kryterium inżynieryjne w uzgodnionym, pokrytym testami zakresie i nie blokuje dalszej Roadmapy.
- PHYSICAL: NOT_RUN, FAIL, PASS, NOT_APPLICABLE. Dotyczy realnego buildu na docelowym OS, podpisania/instalacji APK, działania rzeczywistych wag, pomiarów sprzętowych, wdrożeń i testów produkcyjnych. Nie wymaga się PHYSICAL PASS do zakończenia kryterium modelowalnego; pozostaje konieczne do deklaracji rzeczywistego wykonania tych operacji.

Brak infrastruktury daje SIM_REQUIRED (oczekuje na implementację/wykonanie testu), nie automatyczny PASS. Nie zastępuje się symulacją dowodu, który można uzyskać lokalnie (kompilacja, statyczna analiza, rzeczywiste testy jednostkowe, sprawdzenie dostępnych plików i ich SHA). Brak kodu, artefaktu lub uprawnień nie jest dowodem wykonania; dla niemodelowalnego kryterium zapisuje się rzeczywisty bloker i kontynuuje zadania niezależne.

## Kontrakt testu deterministyczno-inżynieryjnego

1. Identyfikator wymagania i testu; rzeczywisty moduł produkcyjny, jego SHA oraz granica symulowanego otoczenia.
2. Wersjonowana konfiguracja, fixtures, seed (gdy jest losowość), kontrolowany zegar i deterministyczny harmonogram zdarzeń.
3. Jawne inwarianty i oczekiwane wyniki: ścieżka poprawna, błędy graniczne, timeout, awaria, przerwanie, recovery, izolacja i zasoby, tam gdzie mają zastosowanie.
4. Uruchomiony test z asercjami, wynikiem exit code, licznikami PASS/FAIL/SKIP, środowiskiem, poleceniem i SHA-256 logu. Test regresyjny: RED przed poprawką, GREEN po poprawce.
5. Powtarzalny wynik na identycznych danych; w razie niedeterministyczności jawna tolerancja i kryteria statystyczne.
6. Wskazane założenia, niepokryte właściwości oraz rozróżnienie testu modelowego, integracyjnego z symulowanym adapterem i rzeczywistego E2E.

SIM-PASS nadaje się wyłącznie po wykonaniu odpowiednich testów i spełnieniu wszystkich zdefiniowanych kryteriów danego zakresu. Nie zalicza się nieuruchomionych testów, pustych funkcji, pozornych integracji ani sztucznie wygenerowanych raportów.

## Klasy dowodów

| Klasa | Znaczenie | Wymagany dowód |
| --- | --- | --- |
| IMPLEMENTED | Kod jest w repo | Ścieżka + commit SHA |
| UNIT-TESTED | Testy deterministyczne PASS | Polecenie, środowisko, wyniki i wersja kodu |
| SIM-VERIFIED | Model/kontrakt przetestowany | Kontrakt powyżej, powtarzalne wyniki |
| INTEGRATION-VERIFIED | Rzeczywiste komponenty współpracują | Log integracyjny, wersje, oznaczenie ewentualnych symulowanych granic |
| HARDWARE-VERIFIED | Zbadano docelowy sprzęt | Urządzenie, build, log i pomiary |
| RELEASED | Opublikowano rzeczywisty artefakt | Suma SHA-256, podpis, wersja, kanał dystrybucji |
| PRODUCTION-VERIFIED | Potwierdzono produkcję | Telemetria i odtworzone kryteria odbioru |

Nie ma automatycznego awansu między klasami. Symulacyjny E2E jest E2E scenariusza w symulowanym środowisku, nie fizycznym E2E. Symulacja nie dowodzi zgodności licencji, braku aktualnych CVE, realnej integralności niedostępnych wag ani pomiarów przepustowości urządzenia.

## Bezpieczeństwo i Git

Każdy import zewnętrznych plików nadal wymaga pochodzenia, integralności, kontroli licencji i sekretów przed publikacją. Prywatnych danych nie przenosi się do publicznego repo bez uprawnień. Jedyna gałąź: main; atomowe zmiany bez force push, weryfikacja SHA bazowego. Nie aktywować płatnych workflow/runnerów bez decyzji kosztowej.

## Ścieżki odbioru następnych etapów

Szczegółowe scenariusze i ich status: [macierz symulacji](SIMULATION_MATRIX.md). Wykonujemy autentyczne lokalne testy tam, gdzie możliwe, oraz deterministyczne symulacje niedostępnych granic dla RUN-001, AND-001 i GPU-001. Fizyczne wykonanie jest oddzielnym rejestrem dowodów, nie warunkiem rozpoczęcia kolejnego etapu inżynieryjnego.
