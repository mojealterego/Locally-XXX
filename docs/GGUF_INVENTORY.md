# Offline GGUF Inventory — OMEGA-X

Narzędzie: `scripts/gguf-inventory.mjs`. Wymaga Node.js >=22, bez npm install, bez dostępu do sieci, bez API lub kluczy. Bazuje na GGUF v2/v3 zgodnie z [gguf.h w llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/ggml/include/gguf.h), sekcja struktury nagłówka.

## Uruchomienie

```bash
node scripts/gguf-inventory.mjs /storage/models
node scripts/gguf-inventory.mjs /storage/models --sha256 --ram-gib 12 --reserve-gib 3
npm run models:inventory -- /storage/models --sha256
node --test tests/gguf-inventory.test.mjs
```

Na Termux ścieżka powinna wskazywać rzeczywisty katalog z modelami GGUF, np. po wykonaniu `termux-setup-storage` można skanować `$HOME/storage/shared/Models`, jeżeli taki folder istnieje. Narzędzie nie pobiera modeli ani nie prosi o uprawnienia do Android poza zwykłym odczytem wskazanych plików.

## Kontrakt wyjścia

Dane: JSON `schema: 1`, `models[]`, `rejected[]`, `visitedEntries`, `bytes`, `status`. Rekord zawiera ścieżkę, rozmiar pliku, wersję nagłówka, liczbę tensorów i metadanych (jako string dla zachowania precyzji u64), oraz opcjonalny SHA-256 pliku. Nie dołącza surowych danych modelu.

Kody zakończenia: `0` — parsowane nagłówki bez odrzuceń, `2` — częściowy wynik z błędami, `1` — błąd wejścia lub katalogu. Ograniczenie domyślne: 50 000 pozycji i 12 poziomów rekurencji. Dowiązania symboliczne są odrzucane.

## Profil szacowania pamięci

Domyślnie RAM 12 GiB, rezerwa 3 GiB, mnożnik 1.25 dla rozmiaru pliku. Warunek `fileOnlyWithinBudget` to **tylko heurystyka** (model + przypuszczalny narzut). Nie jest to analiza architektury modelu, VRAM, KV-cache, przegrzewania, fragmentacji RAM, aktywnych procesów ani tokenów/s. W praktyce możliwe jest zarówno OOM przy wyniku `true`, jak i uruchomienie modelu mimo `false` przy częściowym offloadzie/mmap.

## Granice bezpieczeństwa i dowodów

Odczyt samego nagłówka nie dowodzi kompletności GGUF; plik skrócony do 24 bajtów może mieć poprawne pola. Parametr `--sha256` potwierdza tożsamość bajtów tylko po porównaniu hasha z **zaufanym zewnętrznym manifestem**. Nie następuje żadne wywołanie LLM/GPU. Skaner nie podąża za symlinkami. Zmiany na systemie plików podczas skanowania są sprawdzane pod kątem rozmiaru, mtime i inode pliku, ale nie eliminują wszystkich ataków TOCTOU na współdzielonych katalogach.

Przed oznaczeniem modelu jako gotowego do produkcji wymagany jest pełny test `llama.cpp` na docelowym urządzeniu oraz analiza poprawności metadanych/tensorów, wydajności i pamięci.
