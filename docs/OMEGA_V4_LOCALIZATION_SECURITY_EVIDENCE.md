# OMEGA-X v4 — lokalizacja, Android branding i izolacja powłoki

Baza: 192782c58fbfee26b3bf434e12d3c8c43746c5c1; przypięty upstream 2.6.7. Zakres: trzy punkty, nie pełny odbiór produktu.

## V4-I18N
- Słownik typowany PL/EN, polski domyślny, bez zmiany ID modeli/person; locale tag dokumentu, ustawienia v22, wybór języka w ustawieniach i kreatorze, główna nawigacja, część kreatora, 25 nazw person.
- 6 testów Node, TypeScript strict; rzeczywisty moduł. Reszta tekstów, katalog, person prompts, pełny build i E2E NOT_RUN.

## V4-ANDROID
- Nakładka Python aktualizuje generowane zasoby values i values-pl, zachowuje identyfikator pakietu i FileProvider. Odrzuca symlinki, duplikaty zasobów, niejednoznaczny launcher i DTD. Idempotencja, SHA-256.
- `npm run runtime:android-brand -- WORKSPACE` lub `npm run runtime:build -- android WORKSPACE REPORTS --initialize-android --native-lifecycle --android-brand --signer-sha256 PIN --package-id PACKAGE`. AAPT2 dump badging stanowi obowiązkową bramkę wersji z brandingiem. Testy sprawdzają XML i modelowany raport AAPT2, nie rzeczywisty APK. Wymagany podpis odpowiadający dotychczasowej instalacji; zmiany ID nie wykonano.
- 8 testów Python PASS. Pełny Gradle/Tauri i realny aapt2 NOT_RUN. Aktualizacje plików atomowe per plik (nie cały zestaw), po przerwaniu powtórzyć na świeżym workspace.

## V4-SEC
- Zmiana istniejącego shell_execute: Linux wymaga /usr/bin/bwrap i /bin/bash, usuwa środowisko, włącza namespaces, read-only systemowe ścieżki, prywatny /tmp, ograniczony /work i brak fallbacku. Wymaga jawnego chat ID; dowolne cwd/workingDirectory poza per-chat workspace odrzucone. Timeout i limity wejścia. Windows/macOS/Android fail closed. Zmienione zachowanie: brak powłoki na nieobsługiwanych OS i brak dowolnego repo poza sandboxem. Nie jest to implementacja Landlock/AppContainer/Seatbelt. Brak niezależnej autoryzacji chat ID i ochrona przed lokalnym wyścigiem zmiany ścieżki nieudowodnione; nie jest to gwarancja cross-tenant security.
- Trzy testy Rust w module dodane; rustc i bwrap nie są dostępne, kompilacja/testy i rzeczywisty namespace NOT_RUN. Brak modułów Computer Control 3.0.10 w bazie 2.6.7; wzorce polskie nadal OPEN.

## Testy lokalne
Środowisko Linux, Node 22.16.0, tsc 5.8.3, Python 3.13.5. RED: brak modułów, testy nie przechodziły. GREEN: `node --test tests/i18n-v4.test.mjs` 6/6; `python -m unittest discover -s tests -p test_android_brand.py -v` 8/8. Łącznie 14 uruchomionych testów, 0 FAIL. Sha256 logów: RED i18n 1572dfb377b2ea5604161577bfdb79dcad5fdc702999eb209d79eedf0ca858ba; GREEN i18n 44b980bb1966d2c034e584b801e1aa6dcb49aebc142252f33fbae9459389476c; RED Android dc459a9d5217eb761ab913d49d0c49f51e3b243b8b35db960eb961380410d37e; GREEN Android 42cd41f4b69bad2cf0c1742fdcf4862c612141ac6152743c19d890d0598c049e.

Testowane blob SHA: locale 5f0e1f28eb0dcd84108288dd166ee2751b96e83d; test i18n 983d2d23a13aec319b861f469a593d698233b768; android_brand 5b67e40367189d5b27e0fdc96a52b41fc866dae0; test Android 2ae670e6935c7ceb836f9e03bea028ef2d9f3c0c. Rust źródło 40928b16a75aad0999dfcba43bea9c1e9d791d55, niekompilowane. Manifest b87bb38a957cf20f5864586c6528f67ba34bf6bb, instalator 528b6d4aa0d5e76f51ab9536763d96710a9ec1ec. 78 nowych kotwic w dziewięciu plikach źródłowych sprawdzono statycznie na przypiętym upstream. Nie powtórzono całej regresji historycznej ani pełnej materializacji.

GATE-04 PASS wyłącznie dla 14 faktycznie uruchomionych testów modułowych; GATE-05, GATE-06, GATE-07, GATE-09 częściowe lub nieuruchomione. Status produktu PARTIAL.
