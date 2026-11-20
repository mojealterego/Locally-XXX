# ENT-12 / ENT-15 / ENT-16 — dowody
Baza main: 38f8f28513e8bda2a86379e3060924ffa6ff902b. Node v22.16.0, Linux. Testy w /tmp/lu-next, wyizolowany backend z poprzednimi modułami ENT-09/10/11. Nie uruchomiono pełnego repozytorium, fizycznego GPU, usług zewnętrznych ani płatnego CI.

## ENT-12
ResourceArbiter: jedno procesowa rezerwacja 1 lub 2 modeli na tym samym backendzie/urządzeniu, best-fit z deterministycznym tie-break, maks. 1024 leases, telemetry update do 64 urządzeń, limit świeżości 5 s, headroom 512 MiB, stan hot/unknown odrzucony, jawne release na podstawie tożsamości obiektu. Odświeżenie telemetrii nie usuwa rezerwacji. Wolna pamięć odejmowana konserwatywnie wraz z aktywnymi rezerwacjami (może podwójnie liczyć już fizycznie alokowane bajty). Nie zwalnia lease na timeout bez potwierdzenia zakończenia. KV: 2 * layers * kv_heads * head_dim * context * bytes_per_element (BigInt) dla pojedynczej sekwencji i pełnych elementów; formaty blokowe, padding, batching, sliding window, MLA poza zakresem. Brak discovery, rzeczywistego load/unload i fizycznych benchmarków; przydział w jednym procesie, nie izolacja tenantów, nie distributed lock. Operator musi przekazywać jednoznaczny rejestr fizycznych zasobów, nie duplikować GPU pod różnymi identyfikatorami.

## ENT-15
compressContext: do 256 wiadomości/4 MiB tekstu; system i recent oraz pinned zachowane; waga .1+.9*exp(-decay*age) liczona dla historycznych wiadomości; najnowsze bloki mają pierwszeństwo. Count adapter ma liczyć rzeczywisty prompt po chat template, łącznie z całym narzutem. Przy przekroczeniu protected budget błąd; powtórny count pełnego kandydata; odrzuca za długie streszczenie. Oryginały z identyfikatorami, hash i target w zwracanym archive; host ma zapisać je przed odrzuceniem historii. Streszczenia jako dane historyczne we wiadomości assistant, nie system. Nie gwarantuje ochrony przed injection ani utrzymania jakości; nie wywołano rzeczywistego tokenizera, test count jest deterministycznym MODELED BYTE-COUNT z narzutem 2. Brak adapterów inference, timeoutu zewnętrznych callbacków, RAG persist/retrieval, narzędziowych message pairs i benchmarku jakości lub VRAM. Nie jest to LLMLingua.

## ENT-16
CheckpointStore: SQLite (Node sqlite eksperymentalne w tej wersji), prywatny katalog, kontrola owner/mode/symlink/hardlink pliku, AES-256-GCM losowy 96-bit nonce, AAD z tenant/project/revision, HMAC-SHA256 dla idempotency, append-only przez API, BEGIN IMMEDIATE + synchronous FULL, CAS, limit 1 MiB payload, wykrywanie uszkodzenia i zły klucz. Idempotency dotyczy identycznej serializacji JSON następnej rewizji. Test rzeczywistego SIGKILL procesu po zatwierdzonym zapisie i odczytu w nowym procesie PASS. Nie testowano utraty zasilania, ataku na hosta, usunięcia najnowszego rekordu lub całej bazy (brak zewnętrznego anti-rollback anchor), awarii w trakcie zapisu ani wielu hostów. Metadata scope/revision jawne; tenant i project to scoped keys, nie samodzielne uwierzytelnienie, wyłącznie zaufany host. Nie ma per-tenant key derivation, rotacji/KMS, retencji, limitu dysku, 30s schedulera, S3/PostgreSQL/IndexedDB sync, RPO/RTO; wymagane przed produkcją.

## Polecenia i wyniki
RED: node --test test/resource.test.mjs, exit 1 (brak modułów), SHA256 289f97e942e354efc2027b287416c119544b6afdf536b37d44700e2e0ffc9828.
Pierwszy GREEN npm test: 29/29 PASS; SHA256 4ee9bb48770fc0902da8b25080ebe0ade96403ac28d70654a672e06ebc01cdc2. Zmieniono test CTX-01, aby uwzględniał rzeczywisty narzut metadanych, oraz role summary assistant; dodano trzy testy graniczne, bez odrębnego RED dla nich.
Final npm test: 32/32 PASS, 0 FAIL/SKIP/CANCEL (15 nowych + 17 regresji). SHA256 52daa89b6b9606b249c1c4cc1c3afa18bae32eec63d10ff55d12d0faa2a371f5. find src -name '*.mjs' -print0 | xargs -0 -n1 node --check — exit 0. 
Git blob hashes zgodne z lokalnymi plikami:
resource-arbiter.mjs 73fbebd6dddea33e47ea692cc9ed58ecd2df1809
context-compressor.mjs 84f26b94f69f4e3814104f1c395ebac69680d535
checkpoints.mjs a71666fe6d44676ccfa5d325218e67ac16d13d3a
resource.test.mjs 4046bc4e2e4ec8183f7a277aa6e327a267915b56
GATE-04 PASS w zakresie 32 testów. ENT-12/15/16 PARTIAL. Brak pełnego CI/SDK/klastrów i integracji z Tauri; GATE-09 niezaliczony.
