# OMEGA-X — zasady odbioru i walidacji

Status: zasady procesu inżynieryjnego, nie deklaracja certyfikacji, wdrożenia ani ukończenia oprogramowania.

## Rezygnacja z obowiązku zewnętrznego audytu

Dla etapów zależnych od niedostępnej infrastruktury przyjmujemy **wewnętrzne testy inżynieryjne oraz deterministyczne symulacje** zamiast wymagania formalnego zewnętrznego audytu. Przyjęcie symulacji jako dowodu dotyczy wyłącznie testowanej logiki, kontraktu i modelu awarii. Nie może być przedstawiane jako dowód rzeczywistego działania GPU, Androida, sieci rozproszonej, pobrania wagi ani testu hardware E2E.

## Klasy dowodów (bez automatycznego awansu)

| Klasa | Znaczenie | Wymagany dowód |
| --- | --- | --- |
| IMPLEMENTED | Kod jest w repo | Ścieżka + commit SHA |
| UNIT-TESTED | Testy deterministyczne zakończone PASS | Polecenie, środowisko, wyniki i wersja kodu |
| SIM-VERIFIED | Modele awarii i kontrakty przeszły symulację | Powtarzalny seed, wejścia, asercje, brak pomijanych scenariuszy |
| INTEGRATION-VERIFIED | Komponenty współpracują w rzeczywistym lub kontrolowanym środowisku | Log integracyjny, wersje zależności, znane ograniczenia |
| HARDWARE-VERIFIED | Zbadano docelowy sprzęt | Identyfikacja urządzenia, build, log i pomiary |
| RELEASED | Opublikowano identyfikowalny artefakt | Suma SHA-256, podpis, wersja, kanał dystrybucji |
| PRODUCTION-VERIFIED | Potwierdzono funkcjonowanie w produkcji | Telemetria i odtworzone kryteria odbioru |

Wyniki testów nie przenoszą się automatycznie między klasami. Klasy muszą być przypisane osobno do każdego modułu. Brak wyników oznacza **niezweryfikowane**, a nie **zaliczone**.

## Kryterium niezawodności

1. Test ma odtwarzać realny kod albo jawnie opisywać model symulacyjny; sama dokumentacja nie jest wynikiem testu.
2. Nie wolno używać atrap, pustych funkcji ani syntetycznych raportów jako dowodu działania infrastruktury.
3. Dla błędu: najpierw test regresyjny RED, następnie implementacja i GREEN.
4. Eksperyment sprzętowy bez wymaganego urządzenia pozostaje otwartym zadaniem — także wtedy, gdy symulacja przeszła.
5. Każdy import zewnętrznych plików musi potwierdzić pochodzenie, integralność, licencję i brak sekretów przed opublikowaniem.
6. Nie aktywować płatnych workflow/runnerów bez osobnej decyzji o kosztach; komendy offline służą walidacji bez zależności od GitHub Actions.

Dla Locally-XXX kolejność odbioru to: niezależna materializacja 1112 plików → przypięta weryfikacja SHA → czysty build i testy desktop → odrębne przygotowanie ARM64 → APK i testy sprzętowe. Jedynie pierwsze elementy infrastruktury walidacji są obecnie zaimplementowane.
