# OMEGA-X v4 — PL-RAG / pamięć: dowody przyrostu

Baza: 04286268064408764754e60f3bb949b9e7aff567 (upstream staged 2.6.7). Środowisko: Linux x86_64, Node 22.16.0, TypeScript 5.8.3, Git 2.47.3.

## Implementacja
- 27 jawnych rodzin fleksyjnych domeny technicznej, normalizacja Unicode, zachowanie nieznanych tokenów i negacji; bez globalnego obcinania sufiksów.
- Wspólne kanonizowanie RAG i zapytań pamięci. Jednoprzebiegowe BM25 na tytułach, opisie, treści i tagach. Próg surowego cosinus 0,50 lub dodatni dowód leksykalny przed dopuszczeniem pamięci; recency/type boost nie zastępują relewancji. Pusty podgląd scorera pozostaje, pusta ścieżka wstrzykiwania offline nie dołącza wspomnień.
- Fallback w memoryStore: dopasowanie pełnych tokenów, zachowane wagi pól, limit zapytania 8192 znaków/256 tokenów, korpus 8192 wpisów/8 mln znaków. Interaktywne wyszukiwanie pamięci zachowuje dotychczasowy scoring.
- Nakładka rozszerzona o 2 źródła, 9 jednoznacznych kotwic, bez modyfikacji snapshotu upstream.

## Dowody wykonania
Komenda: `node --test tests/rag-retrieval.test.mjs tests/rag-polish.test.mjs tests/memory-polish.test.mjs`.
- PL RED: 4 PASS / 4 FAIL; SHA-256 logu bc8f0c2fb67e1662dd134c7a124a627895b05f0d9cc7dcfd1fd133ace0adfc2f.
- MEM RED helpery: 8 PASS / 3 FAIL; SHA-256 logu 96d9c9a388b88f0197b6fce00d53f908c494c4b1f086f0262566c199e914cf0b.
- GREEN: 22 PASS / 0 FAIL (16 nowych, 6 istniejących), SHA-256 logu d4aeebb60909c8a64e66f1da6706049d107533f3082af6211655389f3ffcb860.
- TypeScript strict/noUnused: PASS dla rzeczywistego helpera. Test scorera kompiluje przypięte źródło memory-retrieval z nakładką, rzeczywisty upstream cosineSimilarity oraz minimalny typ MemoryFile użyty jako fixture. Nie jest testem całej aplikacji.
- Blob helpera 425b61ce07bacf680e2ed7066dfc47df67b56aea; test PL 2a3bca09006530126192ca3fd98f18ada768236f; test MEM ed249c5b88c8ac51d36660c9bb5b49862815c7df; test regresji RAG c605eca103c5795cb29d6343bfbf5b2e39d9856c.
- Manifest 00f5269fc8ca6c17461f34cba05016cab9f65a9b; installer 0162a46a296cdb457b0c73b121fca5e21286418e. Weryfikacja jednoznaczności wszystkich 9 nowych kotwic na rzeczywistych przypiętych źródłach przez odczyt GitHub. Pełny store/React, wykonanie instalatora na pełnym drzewie i E2E: NOT_RUN.

## Odbiór
GATE-01/02: PASS w zakresie przyrostu; GATE-03: PARTIAL (warstwa store zintegrowana przez manifest, nie wykonana end-to-end); GATE-04: PASS w zakresie 22 testów; GATE-05: PARTIAL (scorer, nie pełny runtime); GATE-06/07: częściowo sprawdzone limity, fail-closed i przypadki niepoprawnych wektorów, pełny audyt NOT_RUN; GATE-08: dowody powyżej; GATE-09: PARTIAL.
Nie jest to uniwersalny lematyzator polski ani dowód jakości na pełnym korpusie. To celowo konserwatywna nakładka na bazę 2.6.7; brak potwierdzenia kompatybilności z 3.0.10. Pełna regresja 258 historycznych testów nie była powtórzona w tym przyroście. Natywna ingestia, polski embedding, UI, głos, rebranding, IPC i nowe GPU wymagają odrębnego wdrożenia.
