# OMEGA-X v4 — V4-RAG / V4-VOICE / V4-IPC

Baza: 59f9e13d1184b9c8ae7b495115f507c3dec183ba. Upstream nadal 2.6.7. Przypięty snapshot nie został zmodyfikowany. 51 nowych kotwic w 15 plikach upstream, zaaplikowanych w pamięci z kontrolą jednoznaczności.

## V4-RAG
- Worker `omega_ingest.py` wykonuje rzeczywistą ekstrakcję TXT UTF-8/UTF-16, PDF (pypdf), DOCX i XLSX (openpyxl, cached cells, brak wykonania formuł). Rust IPC `ingest_document_native` wywołuje go poza WebView na Linuksie; wyłącznie bajty z pliku wybranego przez użytkownika, nie arbitralna ścieżka IPC. Prywatny plik RAII, maks. jeden proces, 30 s timeout, limit CPU 20 s / AS 768 MiB, plik 25 MiB, ZIP 64 MiB, tekst 180 kB; walidacja ZIP/XML; jawne błędy.
- To przejściowy worker Python pod kontrolą Rust, nie parser Rust ani pełny sandbox OS. Na Linux Tauri brak zależności powoduje jawny błąd bez cichego fallbacku; na pozostałych platformach i w przeglądarce pozostaje dotychczasowa ekstrakcja. Operator musi dostarczyć pypdf i openpyxl do interpretera wybieranego przez resolve_lu_python; nie wykonano instalacji ani audytu supply chain tych bibliotek. Pełny runtime, SQLite-vec i wielojęzyczne embeddingi OPEN.
- 7 testów rzeczywistych procesów/plików PASS, w tym DOCX, XLSX, PDF, Unicode, patologiczne ZIP/XML i limity. Nie jest to test IPC Rust/Tauri.

## V4-VOICE
- Preferowany język PL/EN z ustawień przekazywany do Whisper przez Tauri i Vite. Obie kopie whisper_server.py walidują język; starszy klient bez parametru nadal używa auto. Systemowy TTS ustawia język, jednocześnie respektując jawnie wybrany głos. Picker Piper rozszerzony o pl_PL-gosia-medium (pobranie na żądanie, nie wykonane). Segmentacja zdań, skrótów i liczb dziesiętnych, zachowanie CJK. Prywatne pliki audio RAII w Rust i limit base64.
- 4 testy TypeScript PASS; nie przeprowadzono STT na wagach Whisper ani syntezy Piper, nie zweryfikowano dostępności binarnej głosu w środowisku docelowym. Android TTS i zdalny pełnodupleksowy Opus otwarte.

## V4-IPC
- Istniejący streaming LLM przez Tauri Channel zachowano. Nowy DownloadRegistry z watch, notyfikacje po mutacji mapy, maksymalnie 4 subskrypcje, 30 s dzierżawy, maks. 4096 wpisów na snapshot. Tauri Channel przekazuje pełne snapshoty, klient odnawia dzierżawę, backoff 250 ms–8 s, odrzuca zdarzenia poprzedniej generacji i nie konkuruje z GET. Aktualizacja ewma co 250 ms, ETA w badge. Tryb web zachowuje dotychczasowy polling. To nie jest zero-copy transport binarny ani lock-free DashMap: zachowano mutex chroniący stan i serializację JSON.
- 3 testy TS PASS, 2 testy Rust dodane (NOT_RUN). Nie zmierzono rzeczywistej wydajności IPC.

## Dowody wykonania
Linux x86_64, Node 22.16.0, TypeScript 5.8.3, Python 3.13; pypdf 5.9.0, openpyxl 3.1.5, python-docx 1.2.0 (generowanie fixture), ReportLab (fixture PDF). Komendy:
```
node --test tests/voice-download.test.mjs
python3 -m unittest discover -s tests -p test_native_ingest.py -v
```
RED: brak nowych modułów; GREEN: 7/7 TS i 7/7 Python PASS. Suma 14/14, zero błędów. SHA-256 logów RED TS d27d1240fbe91d861b811264dfa9aa8329f6c303aaa1c82d6183a814d28ce7dc; GREEN TS 3bceee39200aee4e4a363aed041923a63b8e82b0e447cb4dd1e9de65b0ca3907; RED Python 7acce4c08feb6570335c5a7de867fecd0028b7410ba775afd67e2bb36a523633; GREEN Python 25aeb2df471d3d2d9bbfe470ad15dc7ac0a38f14bde2c5b378a0ae0ed5dd3efa.

Tested Git blob SHA: voice-pl 4d66b2b220cdf79dcfe4914e21a2ff081a6c988e; download-events e530585836267d1e88a252700a0719569407848e; TS test 3c6d3be1588714cf8e03e4b87038f550178c2ca6; worker e81b61252956a7b0d4a6ca9b55037de329d042d0; Python test a04a02ebd6b91c9ffc2831004c7d59de857c5221. Rust IPC and registry blobs 27d001ba2416e5ae5c34121e7d7d715b8f0c52a0 / 5a96ca0062f07ad2e3bea33a2e7b66d6bc42167a; not compiled. Manifest 674acf1448710097d11f49c96f162ae0cad5f0d1; installer eaed94cd951431d51e6802213b747b3637a2ef02.

GATE-04 PASS tylko w zakresie uruchomionych 14 testów. GATE-05/06/07/09 PARTIAL; full app E2E, Rust build, pełna regresja i APK NOT_RUN. Środowisko bez rustc/cargo i dostępu do git remote z kontenera. Brak wydania produkcyjnego.
