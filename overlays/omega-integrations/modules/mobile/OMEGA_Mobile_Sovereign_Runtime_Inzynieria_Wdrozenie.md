# OMEGA MOBILE SOVEREIGN RUNTIME Ω

**Dokumentacja inżynieryjno-wdrożeniowa v1.0.0**  
**Platforma referencyjna:** Samsung Galaxy S24 Ultra, Android ARM64, urządzenie nierootowane  
**Produkt docelowy:** samodzielny podsystem Mobile Compute + selektywna integracja z Locally-XXX  
**Stan:** SPECIFIED / REFERENCE-POLICY TESTED; ANDROID NATIVE BUILD NOT RUN  
**Data:** 21 listopada 2026 r.  
**Śledzenie wymagań:** MOB-001…MOB-048; **decyzje:** ADR-MOB-01…12.

## 1. Cel i reguły inżynieryjne

Celem jest platforma do **wydajnego, kontrolowanego uruchamiania AI na niezmodyfikowanym Androidzie** z opcjonalnym połączeniem z własnymi węzłami GPU i dobrowolną siecią obliczeniową. Oryginalny materiał nazywa to „planem na 7 dni do ASI”. W niniejszej specyfikacji siedem dni oznacza **kolejne etapy weryfikacji wykonalności**, a nie gwarancję powstania AGI/ASI. Przesłany materiał zawiera dni 1–6; dzień 7 zaprojektowano jako odbiór na podstawie dowodów.

**Nie zakładamy** obejścia SELinux, samodzielnego odblokowania ukrytych uprawnień, wyłączenia ochrony termicznej, wykonania dowolnego natywnego kodu JIT z pamięci aplikacji ani tworzenia wytrenowanych modeli przez samą pseudolosową rekonstrukcję wag. Żadna poprawa 50×, „model 1-bit bez utraty jakości” czy automatyczne osiągnięcie ASI nie uzyskuje statusu PASS bez rzetelnych pomiarów.

**Polityka legalnego działania:** udział urządzeń obcych tylko po świadomej zgodzie, wyraźnej informacji o wpływie na baterię i transfer, z możliwością natychmiastowego wycofania; brak ukrytej pracy CPU, manipulowania Play Protect, fikcyjnych kont i samodzielnego dysponowania środkami finansowymi.

## 2. Rozstrzygnięcie architektoniczne i zakres

| Element z materiału | Ocena | Docelowy sposób realizacji |
|---|---|---|
| Bezprzewodowe ADB / DUMP / PACKAGE_USAGE_STATS | Diagnostyka warunkowa | Tylko ręczna sesja deweloperska; minimalne uprawnienia i jawny użytkownik; brak mechanizmu „przejęcia Androida”. |
| Sustained Performance / PerformanceHintManager | Włączyć | Wskazówki do planisty, telemetria termiczna, dynamiczne limity; bez obietnicy stałych maksymalnych taktowań. |
| WebGPU w WebView / Vulkan | Opcjonalnie | Funkcja zależna od urządzenia i WebView; preferowana stabilna natywna ścieżka Vulkan/OpenCL dla ciężkiego compute. |
| FlashAttention, MQA, GQA | Zależnie od modelu | Wykorzystanie implementacji backendu i geometrii istniejącego modelu; brak „konwersji” głowic bez ponownego treningu. |
| Megatron / DeepSpeed ZeRO / FSDP | Tylko zdalnie | Osobny trening w HYBRID/CLOUD-HPC, zgodnie z dokumentacją AOPT; nie jako procesy lokalne na telefonie. |
| „Weightless” 1-bit + pseudolosowe wagi | Badanie | Test kompresji i generatorów proceduralnych z porównaniem jakości; generator pseudolosowy nie odtwarza arbitralnych nauczonych wag. |
| Dynamiczny C++ JIT z /data/data | Odrzucić w wydaniu Play | Prekompilowane biblioteki NDK, interpreter WASM/WASI bez JIT, bezpieczne narzędzia JVM, SSH runner poza Androidem. |
| SmartThings / DeX / Knox | Selektywnie | Publiczne autoryzowane API i sesje użytkownika; Knox nie jest mechanizmem ukrywania się przed Play Protect. |
| P2P Edge Mesh | Włączyć warunkowo | Opt-in, widoczny stan, limit zasobów, charging/unmetered, twarde anulowanie, podpisane zadania. |
| Trading / mikroarbitraż / fikcyjne konta | Poza automatyzacją wykonawczą | Opcjonalne symulacje finansowe; realne zakupy GPU i transakcje wyłącznie po osobnym zatwierdzeniu. |
| ASI w 7 dni | Hipoteza nieweryfikowalna w tej formie | Testy mierzalnych podsystemów i demonstrator, bez etykiet AGI/ASI. |

## 3. Architektura referencyjna

```text
Jetpack Compose / Tauri Android Host / CLI diagnostyczne
      |            |              |
      +------------+--------------+
                   |
      Omega Mobile Control Plane (Rust + JNI)
        | Consent Registry | CaMeL Policy Gateway
        | Runtime Router   | Thermal Governor
        | Memory Lease Broker | Signed Audit
                   |
    +--------------+----------------+
    | Native In-process AI Engine    |   OFFLINE
    | llama.cpp / ggml / libmtmd     |
    | KV Q8/Q4 / stage offload       |
    +--------------+----------------+
                   |
    Optional Egress Gateway (ALLOWLIST + user grant)
       | SSH/mTLS personal GPU worker   | CLOUD-HPC
       | Approved provider / cost guard |
       | Edge Mesh volunteered workers  |
                   |
        Checkpoint + Provenance Chronos
```

### 3.1 Kontrola i zaufanie

- `OmegaMobileCoordinator` jest jedynym właścicielem stanu `REQUESTED → ADMITTED → RUNNING → CHECKPOINTING → PAUSED/COMPLETED/FAILED`.
- `CaMeLPolicyGateway` rozdziela instrukcje zaufane od nieufnych danych z internetu. Nigdy nie wykonuje poleceń systemowych zaczerpniętych bezpośrednio z tekstu zewnętrznego.
- `UnifiedMemoryLeaseBroker` rozlicza rezerwacje RAM dla modelu, KV-cache, enkodera i GUI. Brak możliwości rezerwacji = odmowa albo jawny remote fallback.
- `ThermalGovernor` korzysta z Android `PowerManager`/ADPF i z modelu histerezy. Wysoki poziom throttlingu wyzwala redukcję parametrów lub checkpoint, nie obchodzenie zabezpieczeń.
- `CloudEgressGateway` domyślnie wyłączony; wymaga zgody per dostawca / projekt, budżetu, TLS i audytu.
- `EdgeWorker` nigdy nie startuje bez osobnego przełącznika zgody na *udostępnianie mocy* i nie instaluje ukrytych usług.

### 3.2 Granice platformowe

**Android S24 Ultra:** 12 GB RAM współdzielone pomiędzy system, aplikację i akceleratory. **6 553 MiB** jest jedynie budżetem projektowym z wcześniejszej specyfikacji OMEGA; rzeczywisty limit wymaga pomiaru na urządzeniu, a nie wyprowadzenia z samego `MemoryInfo.availMem`. Android może zabić proces przez LMKD niezależnie od naszych rezerwacji. Native `.so` musi respektować 16 KiB page-size; Android 15 ogranicza `dataSync` i `mediaProcessing` FGS do 6 h w oknie 24 h na typ usługi. Te limity nie oznaczają pozwolenia na nieograniczoną pracę w tle.

## 4. Warstwa natywnego AI i polityka pamięci

**Preferowany runtime:** `llama.cpp`/GGUF in-process, bez zewnętrznego demonizowanego `llama-server`; główny backend dobierany według faktycznie działających operatorów Adreno OpenCL, CPU ARM64, opcjonalnie QNN dla dopuszczonych grafów. Dołączenie backendu na podstawie samej nazwy GPU jest niedopuszczalne; wymagane jest feature probe oraz odpowiedni test poprawności.

**Pamięć kontekstowa:** dla klasycznego KV-cache bez skalowania wymiarów:

\[
M_{KV}[B] = 2 \cdot L \cdot H_{kv} \cdot D_h \cdot C \cdot b_{eff}
\]

Przy `b_eff=2` F16; Q8_0 w typowych blokach 32-elementowych daje około `34/32 B`, Q4_0 około `18/32 B` na element. Rzeczywiste alokacje obejmują wyrównanie, narzut buforów i architekturę konkretnego modelu.

**Weight Streaming:** odczyt mmap, segmentacja etapów, scratch buffers, cache danych i limit page faults. WNN / proceduralne „rejestry” są eksperymentem, dopóki badanie nie potwierdzi zachowania jakości modelu; nie wpisujemy, że miliardy dowolnych trenowanych wag można odtworzyć z krótkiego ziarna RNG.

## 5. Akceleracja, trening i precision

- `FlashAttention` to rodzina jąder uwagi zależna od architektury GPU; warianty FA2/FA3 mają odmienne wymagania sprzętowe. Na S24 Ultra dopuszczamy tylko zweryfikowane backendy mobile. FA3/Hopper nie działa automatycznie na Adreno.
- `MQA/GQA` to **własności architektury modelu**, a nie ustawienia przyspieszające dowolny checkpoint. Wymaga zgodności wymiarów Q/K/V i KV-cache.
- `BF16/FP16/FP8` są profilami zgodności modelu i operatorów. FP8 Transformer Engine przeznaczony jest dla wspierających go acceleratorów serwerowych; Android nie dziedziczy jego korzyści.
- `LoRA/QLoRA` to PEFT; na telefonie przede wszystkim **inferencja z adapterem**, natomiast właściwy trening QLoRA kierowany do remote GPU po zatwierdzeniu kosztu.
- `Megatron-LM`, `DeepSpeed ZeRO` i `PyTorch FSDP` pozostają w zdalnym profilu szkoleniowym, według odrębnego pakietu AOPT.

## 6. Dostęp do systemu Android, WebGPU i bezpieczeństwo

**ADB Wi-Fi** jest narzędziem diagnostycznym wymagającym jawnego parowania i uprawnień deweloperskich. Dostęp do `DUMP` i `PACKAGE_USAGE_STATS` zależy od kontekstu systemowego, polityki i zgody. Nie stanowi trwałego uprawnienia aplikacji z Google Play. Produkcyjna aplikacja nie próbuje dziedziczyć sesji debuggera.

**ADPF** informuje system o zadanym i rzeczywistym czasie wykonania; nie blokuje DVFS i nie wyłącza throttlingu. **WebGPU** sprawdzamy przez capability probe (urządzenie, wersja WebView i backend), bez zakładania bezpośredniego dostępu do wewnętrznych sterowników. **NNAPI** wycofano w Androidzie 15; preferowane nowe interfejsy należy dobrać po sprawdzeniu wsparcia przez konkretnego producenta.

**SELinux W^X:** nie wykonujemy natywnych binariów wypakowanych do zapisywalnego katalogu danych przy targetSdk ≥ 29. Jeśli konieczna jest specjalizacja operatorów, jest ona AOT w CI albo wykonywana w odrębnym, uprawnionym zdalnym runnerze. JIT ART kontrolowany przez środowisko Java nie oznacza możliwości dowolnego kompilowania i uruchamiania własnych ELF.

**Knox:** ochrona danych i zarządzanie enterprise na warunkach Samsung. Żadna polityka nie zezwala na używanie Knox jako tunelu do ukrywania działań przed Play Protect.

## 7. Dobrowolna sieć Edge Mesh

`Edge Mesh` jest odrębnym trybem **świadomie udostępnionych** zasobów. Użytkownik widzi koszt energii, limit użycia CPU, prognozowany transfer, identyfikator zadania i przycisk STOP. Domyślnie jest wyłączony. Dodatkowe warunki: urządzenie ładowane, sieć bez limitu transferu, widoczna aplikacja, wystarczający budżet RAM, temperatura poniżej progu, niewygasła zgoda. Udział odbywa się wyłącznie przez zadania opatrzone podpisem i kontrolę sandbox oraz weryfikację rezultatów. Zablokowana jest automatyczna propagacja do kolejnych urządzeń i przetwarzanie danych wrażliwych bez osobnej umowy powierzenia danych.

## 8. Finanse i pozyskiwanie GPU

System może wyliczać koszty ofert VPS/HPC, prowadzić budżet testowy i przygotowywać propozycje użycia GPU. **Nie** otwiera fikcyjnych kont, nie finansuje sam siebie przez automatyczny trading i nie podejmuje płatnych działań bez wyraźnej, odrębnej autoryzacji użytkownika. Dostęp do kluczy API i płatności pozostaje odseparowany od nieufnego pipeline'u agentowego.

## 9. Wykonanie deterministyczne, kontrakty i stany

`runtime_policy.py` w pakiecie jest wykonywalną, **referencyjną funkcją decyzyjną**, a nie serwisem Android. Przyjmuje typowane dane wejściowe: obciążenie, obserwację urządzenia, tryb, jawne granty i budżet. Zwraca **RUN_LOCAL**, **RUN_REMOTE**, **PAUSE** albo **DENY**, z jednoznacznym kodem przyczyny. Produkcyjne uwierzytelnienie grantów (podpis, tenant, expiry, revocation) musi realizować zewnętrzny gateway; sam referencyjny model nie potwierdza podpisu i nie wolno go wykorzystać jako samodzielnej granicy autoryzacyjnej.

### 9.1 Model stanów

```text
CREATED -> VALIDATED -> ADMITTED -> RUNNING -> CHECKPOINTING -> COMPLETED
                  |        |         |           |      |
                  +--------+---------+-----------+-------> PAUSED
                  |                   |
                  +-------------------> DENIED / FAILED
PAUSED -> REVALIDATED -> RUNNING  (nowa zgoda / nowa obserwacja)
```

Przejścia wymuszają token idempotencji, numer wersji checkpointu, monotoniczny identyfikator zdarzenia i wyłączność dzierżawy modelu. Na przerwę związaną z thermal/FGS następuje zapis atomowy `write temp → fsync → rename → fsync directory` tam, gdzie system plików wspiera takie gwarancje. Powtórne żądanie wykonania po wznowieniu nie może automatycznie dwukrotnie obciążyć konta chmurowego.

### 9.2 Przykład kontraktu JSON

```json
{
  "request_id": "job-20261121-0001",
  "principal": "local-user",
  "mode": "HYBRID",
  "kind": "INFERENCE",
  "model_ref": "hf://example/quantized-model.gguf",
  "required_ram_mib": 3584,
  "max_duration_sec": 1800,
  "cloud_egress_requested": false,
  "estimated_cost_usd": 0,
  "allow_payment": false,
  "checkpoint_required": true
}
```

Powyższe wartości są **przykładem struktury**, nie poleceniem pobrania konkretnego modelu. Dokładny schemat walidacji znajduje się w `schemas/workload.schema.json`. Tenant i autoryzacja muszą być weryfikowane przed alokacją zasobów.

## 10. Harmonogram siedmiu dni: kryteria realnego odbioru

| Dzień | Z materiału wejściowego | Wykonalny rezultat, który podlega odbiorowi |
|---|---|---|
| **1: Android i izolacja** | ADB, ADPF, WebGPU, attention | Audyt uprawnień, telemetria thermal/LMKD, capability probe, wynik inferencji bazowej; zero prób eskalacji uprawnień. |
| **2: Pamięć i wagi** | Weightless NN, 1-bit, „wirtualne rejestry” | Profil modelu: RSS/PSS/KV, porównanie Q4/Q8/1-bit tylko na rzeczywiście istniejących wagach; raport jakości i czasu. |
| **3: Kompilacja i operatorzy** | ART/JIT, native C++ | Benchmark prekompilowanych jąder NDK i WASM interpreter; poprawny build 16 KiB, bez execve z katalogów danych. |
| **4: Samsung ecosystem** | DeX, SmartThings, Knox | Jawnie autoryzowany adapter i monitor statusu; brak nieuprawnionego dostępu do urządzeń domu; emulator/test device profile. |
| **5: Edge Mesh** | P2P WebRTC, rozproszone obliczenia | Dwa dobrowolnie zarejestrowane węzły testowe z podpisanym zadaniem i demonstracją natychmiastowego STOP. |
| **6: HPC i autonomiczne zadania** | „ASI”, finansowanie GPU | Zdalne zadanie na własnym runnerze, koszty przed wykonaniem, checkpoint/retry/rollback; bez autonomicznych płatności. |
| **7: Odbiór (dodane)** | Brak w źródle | E2E z rzeczywistym S24 Ultra, raport: co działa, co jest modelowane, czego nie uruchomiono; GATE-01…09 bez fałszywych PASS. |

**Próg ukończenia:** zakończenie siedmiu etapów oznacza co najwyżej zweryfikowany prototyp interoperacyjności, nie automatyczne potwierdzenie inteligencji ogólnej ani superinteligencji.

## 11. Wymagania funkcjonalne i niefunkcjonalne — MOB-001…048

| ID | Wymaganie | Sprawdzalny warunek odbiorowy |
|---|---|---|
| MOB-001 | Trzy tryby OFFLINE/HYBRID/CLOUD-HPC | Odrębne reguły egress; OFFLINE = 0 połączeń na zewnątrz. |
| MOB-002 | Domyślna izolacja lokalna | Brak konfiguracji API = brak ruchu do chmury. |
| MOB-003 | Jedno źródło prawdy o zadaniach | Identyfikator, wersja stanu, audyt. |
| MOB-004 | Kontrola uprawnień Android | Brak nieudokumentowanych grantów i automatycznego ADB. |
| MOB-005 | ADPF/PerformanceHintManager | Wysyłanie celu czasu pracy i raportowanie wykonania; bez wymuszania zegarów. |
| MOB-006 | Thermal Governor | Zatrzymanie/obniżenie obciążenia przy progu telemetrii. |
| MOB-007 | Obserwowalność RAM i LMKD | Eksport PSS/RSS/KV z oznaczeniem niepewności pomiaru. |
| MOB-008 | Memory Lease Broker | Brak nadprzydziału w modelowym budżecie. |
| MOB-009 | Native in-process GGUF | Brak wywoływania zewnętrznego procesu `llama-server` w wydaniu Play. |
| MOB-010 | Walidacja kompatybilności modeli | Wykrywanie formatu i tokenizera przed uruchomieniem. |
| MOB-011 | Efektywne bufory KV-cache | Mierzalna alokacja i poprawne kwantyzacje. |
| MOB-012 | Stage-offload / mmap | Integralność wag, deterministyczne checksumy. |
| MOB-013 | Experyment 1-bit / WNN | Porównanie perplexity/accuracy i jakości z baseline; zero fikcyjnego „odzysku” wag. |
| MOB-014 | Testy FlashAttention | Rozróżnienie wersji i wymagań akceleratora. |
| MOB-015 | MQA/GQA compatibility | Brak niedozwolonych przekształceń architektury wag. |
| MOB-016 | Mixed precision profiles | Twarde wykrycie operatorów, test stabilności numerycznej. |
| MOB-017 | LoRA inferencyjna | Ładowanie/zdejmowanie adaptera i zachowanie wag bazowych. |
| MOB-018 | QLoRA zdalne | Plan treningu wymaga runnera, danych i zatwierdzenia kosztów. |
| MOB-019 | Megatron/ZeRO/FSDP zdalne | Żadne lokalne wymuszenie CUDA na Adreno. |
| MOB-020 | Kompilacja natywna zgodna z W^X | Brak execve niezaufanych plików w katalogu aplikacji. |
| MOB-021 | Test 16 KiB ELF/ZIP | Wszystkie dystrybuowane `.so` i pakiet przechodzą kontrole. |
| MOB-022 | Natywny WebGPU/Vulkan fallback | Feature probe, brak wymuszenia nieobsługiwanego backendu. |
| MOB-023 | Samoobsługowe UI Jetpack Compose | Kontrola start/stop i widoczna kolejka zadań. |
| MOB-024 | Zarządzanie ADB w trybie dev | Parowanie i komendy tylko świadomie wywołane przez operatora. |
| MOB-025 | SmartThings OAuth | Brak odczytu/sterowania bez nadanych zakresów. |
| MOB-026 | Samsung DeX | Layout responsywny i niezależny od usług chmurowych. |
| MOB-027 | Knox / Keystore | Sekrety w sprzętowym Keystore, nie w logach. |
| MOB-028 | Brak obchodzenia Play Protect | Brak ukrywania kodu i zdarzeń weryfikacji. |
| MOB-029 | Edge Mesh opt-in | Brak CPU donation bez aktywnego grantu. |
| MOB-030 | Edge Mesh STOP | Przerwanie, odwołanie lease, brak restartu bez zgody. |
| MOB-031 | Edge Mesh charging/unmetered | Uruchomienie tylko po spełnieniu polityki. |
| MOB-032 | P2P podpisane zadania | Nieznany peer / payload = odmowa wykonania. |
| MOB-033 | Ograniczenia zasobów Edge | Limity RAM/CPU/czasu/transferu egzekwowane. |
| MOB-034 | Brak ukrytej rekrutacji | Jawna informacja o udziale i wycofanie zgody. |
| MOB-035 | Gateway hybrydowy | Endpointy allowlist, TLS, weryfikacja certyfikatów. |
| MOB-036 | Granica kosztu chmurowego | Zlecenie z szacowanym kosztem poza budżetem odrzucone. |
| MOB-037 | Human-in-the-loop | Oddzielna zgoda na płatne/zewnętrzne działania. |
| MOB-038 | Brak samodzielnego tradingu | Moduł nie składa zleceń na giełdzie ani nie tworzy fikcyjnych kont. |
| MOB-039 | Checkpoint/Resume | Odtwarzanie po FGS timeout i zamknięciu procesu. |
| MOB-040 | Idempotentne retry | Nie dubluje rozliczeń ani renderów po ponowieniu. |
| MOB-041 | Strumieniowanie UI | Backpressure, timeout, retry z ograniczeniami. |
| MOB-042 | Izolacja tenantów | Testy cross-tenant deny, klucze per tenant. |
| MOB-043 | Redaction logów | Brak sekretów, metadanych prywatnych i danych RAG. |
| MOB-044 | SBOM / SPDX | Zachowanie licencji i sum zależności. |
| MOB-045 | Chronos provenance | Dowód wejścia, kodu, modelu, ustawień i wyniku. |
| MOB-046 | Deterministyczny harness polityki | Testy RED/GREEN i wielozestawowe wektory wejścia. |
| MOB-047 | Test na fizycznym S24 Ultra | Pomiar temperatury, czasu, pamięci, energii i jakości. |
| MOB-048 | Bez fałszywych PASS | Odmowa uznania GATE-09 bez natywnego E2E i pakietu dowodów. |

## 12. Kontrakty implementacyjne

### 12.1 Kontroler (Rust — interfejs docelowy)

```rust
pub enum Mode { Offline, Hybrid, CloudHpc }
pub enum Admission { Local, Remote, Pause, Deny }
pub struct ResourceRequest {
    pub workload_id: String,
    pub native_memory_mib: u32,
    pub duration_ms: u64,
    pub cloud_cost_microusd: u64,
}
pub trait MobileAdmissionController: Send + Sync {
    fn authorize(&self, request: &ResourceRequest, mode: Mode) -> Admission;
}
```

To kontrakt projektowy, **nie deklaracja skompilowanego modułu Rust**. Produkcyjna wersja musi używać sprawdzonej tożsamości, podpisanych grantów, aktualnego stanu urządzenia, logowania decyzji i synchronizacji anulowania. Zawarta implementacja Python (`reference/runtime_policy.py`) testuje wyłącznie czystą logikę decyzji; nie wykonuje żądań sieciowych.

### 12.2 Kontrakt telemetrii

```json
{
  "schema_version": "1.0",
  "device": "SM-S928B",
  "runtime_mode": "OFFLINE",
  "thermal_headroom": 0.52,
  "native_leases_mib": 3480,
  "battery_percent": 62,
  "is_charging": true,
  "foreground": true,
  "time_monotonic_ns": 900000000,
  "source": "ANDROID_PLATFORM",
  "measurement_status": "MEASURED"
}
```

Zawsze rozróżniamy `MEASURED`, `ESTIMATED`, `SIMULATED`. Pole `thermal_headroom` jest skalą Androida zmierzającą do 1.0 przy progu SEVERE, **nie procentem wolnego miejsca termicznego**. Wartości w przykładzie są danymi fikcyjnymi do walidacji formatu.

## 13. Model bezpieczeństwa i ochrona przed nadużyciem

| Zagrożenie | Mechanizm | Test negatywny |
|---|---|---|
| Prompt injection z publicznej strony | Oddzielenie danych od poleceń, taint, deny by default | Tekst strony nie może uruchomić zdalnej pracy. |
| Nieautoryzowana chmura | Krótkotrwały grant, egress allowlist, OFFLINE firewall | Nie ma transferu bez aktywacji. |
| Nadużycie obcych zasobów | Jawna, odwoływalna zgoda i widoczne UI | Nieświadomy użytkownik: 0 zadań. |
| Przegrzanie i LMKD | Thermal governor, lease, checkpoint | Przy dużym headroom → PAUSE. |
| Ukryte uprawnienia ADB | Debug-only, użytkownik inicjuje | Wydanie produkcyjne nie uruchamia ADB. |
| Podmiana modelu/pluginu | SHA-256, podpisane artefakty, pinned deps | Nieprawidłowy hash → odmowa. |
| Nieautoryzowane płatności | Rozdział planowania i operacji finansowych | Bez approval = brak operacji obciążających. |
| Przedawniony grant | `issued_at`, `expires_at`, `revoked` | Odrzucenie grantu po wygaśnięciu. |
| SSRF przez pobrany model | DNS + IP pinning, sprawdzanie redirectów | Link-local/loopback/metadata IP = DENY. |
| Wyścig anulowania i wznowienia | Wersjonowane stany, CAS, audit trace | Nie można uruchomić dwa razy tej samej opłaconej operacji. |

## 14. Testy i bramki odbiorowe

**Testy hostowe (wykonane):** `python3 -m unittest reference.test_policy -v`. Sprawdzają funkcję decyzyjną, autoryzację deklaratywnych grantów, OFFLINE, RAM, baterię, temperaturę, Edge Mesh, budżet chmury i zakazane rodzaje pracy. Trzeba pamiętać, że **granty w tym harnessie nie są podpisane**: prawdziwa integracja authn/authz pozostaje do wykonania.

**Testy natywne (NIEURUCHOMIONE):** `./gradlew :app:assembleDebug`, `cargo test --workspace --locked`, testy JNI, `adb shell dumpsys meminfo`, `adb shell dumpsys thermalservice`, testy FGS timeout, `llvm-readelf -l` dla 16 KiB, scenariusz utraty Wi-Fi i anulowania zdalnego zadania. Komendy są **procedurą docelową**, nie logiem zakończonego testu.

| GATE | Kryterium | Aktualny status |
|---|---|---|
| GATE-01 wymagania | MOB-001…048 z mapą do źródeł | SPECIFIED |
| GATE-02 architektura | Kontrakty / ADR / granice Android | SPECIFIED |
| GATE-03 implementacja | Natywny runtime, UI, bridge, węzeł GPU | PARTIAL (policy reference only) |
| GATE-04 testy deterministyczne | Testy hostowe i walidacja kontraktów | PARTIAL |
| GATE-05 integracja/E2E | Prawdziwy telefon + własny runner | NOT_RUN |
| GATE-06 bezpieczeństwo | Testy adwersarialne i kontrola uprawnień | PARTIAL |
| GATE-07 recovery | Checkpointy pod realnym FGS/LMKD | NOT_RUN |
| GATE-08 dokumentacja/dowody | PDF/DOCX/MD, wyniki testów, sumy SHA | PARTIAL |
| GATE-09 odbiór | Wszystkie obowiązkowe bramki zaliczone | OPEN |

## 15. Instalacja pakietu i polecenia weryfikacyjne

1. Rozpakuj archiwum do odizolowanego katalogu. Nie kopiuj plików bezpośrednio do `main`, dopóki nie porównasz aktualnego `docs/ROADMAP.md` i `HEAD` repozytorium.
2. Zweryfikuj `SHA256SUMS.txt` poleceniem `sha256sum -c SHA256SUMS.txt` (w katalogu pakietu).
3. Uruchom testy referencyjnego policy: `python3 -m unittest reference.test_policy -v` (standardowa biblioteka Pythona, bez pobierania zależności).
4. Przenieś docelowe kontrakty do istniejącego modułu Android/Kotlin/Rust, **bez tworzenia duplikatów** `UnifiedMemoryLeaseBroker`, `CaMeL` czy `Chronos`.
5. Przed prawdziwym wdrożeniem uruchom osobny pipeline Android i testy sprzętowe; porównaj wyniki z baseline.

## 16. Zależności, wdrożenie i interoperacyjność

**Reuse-first:** pamięć i zasoby z OMEGA/Aetheris Compute Fabric, inference z Locally-XXX, dowody z Chronos, kontrola z CaMeL. Nowy moduł zawiera tylko Android-specific `MobileComputeCoordinator`, `ConsentUI`, `PowerThermalAdapter` i politykę `EdgeMeshOptIn`. Nie wciąga lokalnie DeepSpeed/Megatron/FSDP. Sam runtime może istnieć oddzielnie jako biblioteka z adapterem JNI.

**Wersjonowanie:** Android release train na `main` z pinem Cargo.lock/Gradle versions; SBOM CycloneDX; eksport testów z SHA commita; brak force push. Wykonanie na produkcji dopiero po podpisaniu, z możliwością rollback i zachowaniem wcześniejszego zaufanego modelu.

## 17. Decyzje architektoniczne — skrót

| ADR | Rozstrzygnięcie |
|---|---|
| ADR-MOB-01 | Android nierootowany jest ograniczeniem projektowym, nie celem eskalacji. |
| ADR-MOB-02 | Jedna kontrola RAM/termiki współdzielona z istniejącym OMEGA runtime. |
| ADR-MOB-03 | Inferencja native in-process, bez obowiązkowego `llama-server`. |
| ADR-MOB-04 | FA3 i trening tensor-parallel tylko na obsługiwanym serwerze. |
| ADR-MOB-05 | Proceduralne wagi tylko jako hipoteza badawcza do pomiaru. |
| ADR-MOB-06 | AOT/NDK/WASI zamiast exec z katalogów zapisywalnych. |
| ADR-MOB-07 | Edge Mesh wyłącznie z jawnym opt-in i łatwym wycofaniem. |
| ADR-MOB-08 | Off-device inference domyślnie wyłączone. |
| ADR-MOB-09 | SmartThings i Knox tylko przez oficjalne API i zgody. |
| ADR-MOB-10 | Płatne operacje po zatwierdzeniu, bez fikcyjnych tożsamości. |
| ADR-MOB-11 | Siedem dni = harmonogram walidacji, nie osiągnięcie ASI. |
| ADR-MOB-12 | Status GATE-09 oparty wyłącznie na uruchomionych E2E i dowodach. |

## 18. Źródła i podstawa weryfikacji

**Źródło podstawowe:** dostarczona w rozmowie specyfikacja „plan na 7 dni do ASI na fabrycznym Samsungu S24 Ultra” (części Dzień 1–6, „Weightless Neural Network”, ADB, Knox, Edge Mesh, zamówienia GPU), wraz z wcześniejszą dokumentacją OMEGA Attention/Distributed Training/PEFT.

**Dokumentacje pierwotne, sprawdzone 21.11.2026:**

1. Android Performance Hint Manager: https://developer.android.com/ndk/reference/group/a-performance-hint
2. Android ADPF Thermal: https://developer.android.com/games/optimize/adpf/thermal
3. Android 10 W^X: https://developer.android.com/about/versions/10/behavior-changes-10
4. Android 15 FGS: https://developer.android.com/about/versions/15/behavior-changes-15
5. Android NNAPI (deprecated): https://developer.android.com/ndk/guides/neuralnetworks
6. Android 16 KiB page sizes: https://developer.android.com/guide/practices/page-sizes
7. Android Debug Bridge wireless pairing: https://developer.android.com/tools/adb
8. Android WebGPU: https://developer.android.com/develop/ui/views/graphics/webgpu/getting-started
9. Samsung Knox API restrictions: https://docs.samsungknox.com/dev/knox-sdk/faq/api-restrictions/
10. Google Play Device and Network Abuse Policy: https://support.google.com/googleplay/android-developer/answer/16559646

**Ograniczenia źródeł:** API nie dowodzą, że każde API jest dostępne na fabrycznym buildzie S24 Ultra z danej dystrybucji. Konieczny jest test możliwości na urządzeniu; zero wymyślonych benchmarków ani deklaracji 50×/1ms.
