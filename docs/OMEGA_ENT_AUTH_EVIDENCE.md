# ENT-05 / ENT-06 / ENT-07 — warstwa tożsamości i autoryzacji

Baza: 605f9512ea6d21ff01cb01bdac2c6fdba51be612. Node 22.16.0, Linux x86_64, Node built-in crypto/http/fetch/SQLite. Nie instalowano zależności npm. SQLite w tej wersji Node jest eksperymentalne; lokalny trwały adapter nie zastępuje klastrowego PostgreSQL.

Kod: `locally-uncensored-enterprise/backend/src/auth/security.mjs` i `src/server.mjs`: rzeczywisty HTTP API, nie demonstracja pozornego wdrożenia. API startup wymaga konfiguracji; nasłuch wyłącznie 127.0.0.1; TLS reverse proxy i readiness zależności muszą być zintegrowane przed udostępnieniem. Nie uruchamiano zewnętrznych usług.

### ENT-05
RS256, RSA ≥2048 bit, issuer przypięty konfiguracją, JWKS z certs endpoint, ograniczenie odpowiedzi/czasu, cache 60s i ograniczone odświeżenie, odrzucenie przekierowań i obcych parametrów nagłówka, walidacja aud/azp/typ/iat/exp/nbf, maks. lifetime 900s, admin-only omega_tenant (UUID). Nie jest to pełny klient OIDC/PKCE ani weryfikacja revocation sesji Keycloak; testowany lokalny serwer JWKS i prawdziwe podpisy. Konfiguracja realm, PKCE i mapper wymagane. Konfiguracja operatora nie może przyjmować tenant claim z edytowalnego przez użytkownika atrybutu.

### ENT-06
POST /allowed zgodnie z https://docs.permit.io/how-to/enforce-permissions/check/ i https://docs.permit.io/how-to/deploy/on-prem/pdp-deployment/ . Uwierzytelnione odwołania serwera; tenant, agent, subject i action; allow wyłącznie literalne true, brak cache allow, awaria = deny. Nie wdrożono polityk/roli w realnym Permit.io. Bramka sprawdzająca nie wykonuje faktycznych operacji; przyszły gateway musi egzekwować decyzję bezpośrednio przy operacji i ponownej walidacji (TOCTOU).

### ENT-07
Tokeny opaque z CSPRNG 32 bajty, tylko hash SHA-256 zapisywany w prywatnym SQLite, grant powiązany z subject/tenant/agent/scope; TTL max 900 sekund nie dłuższy niż token operatora. Delegate oraz każdy scope musi mieć allow z PDP; scopes read/interact/assign_tasks, brak delegowania dalszych uprawnień, delete i approve. Kontrola PDP również przy użyciu, ponowny odczyt w transakcji po sprawdzeniu uprawnień, revocation i transakcyjny audyt ISSUE/CHECK/REVOKE. Maks 10000 aktywnych wpisów, czyszczenie wygasłych podczas wydawania; max 32 aktywne żądania i body 16 KiB. Brak retencji/eksportu audytu i pełnego logowania odmów, rotacji tokenów, centralnej replikacji, proof-of-possession oraz atomowej rezerwacji operacji z downstream; bearer jest replayable do expiry/revocation. Nie wydano rzeczywistych produkcyjnych poświadczeń.

### Wykonane testy
`npm test` z katalogu backend; RED: brak modułu, GREEN: 12/12 PASS, 0 fail, 0 skipped. Rzeczywisty lokalny HTTP, kryptografia RSA, SQLite na dysku i ponowne otwarcie bazy. Keycloak/Permit odpowiedzi deterministycznie modelowane; to nie live E2E z produktami.

RED log SHA-256: 0bd0321e099f259a789ae103ee987ea604943123502ecb44307182fa72ab3fcb
GREEN log SHA-256: c61409a3ca09ccaa41228ac1a46aaa103061618645c9bfe3948328fed81973a5
Blobs: package.json aef74adce9dc6f45c92a47687cd78db9e55eed4e; security.mjs fdaa630ca0dedb4de59fe6f644387bcb34cac2fb; server.mjs 4274d3ea97ce02b0a85d1b041c038f283c6b8c74; security.test.mjs 0cb6ec012d306b46f0921a30df2faea059b01cba.
Testy: OIDC podpis/claims/alg, PDP tenant/action/deny/failure, AIM scope/delegation/expiration/revocation, persistence/drugie połączenie SQLite, HTTP auth/issue/check. Nie wykonano pełnego upstream build/test, rotacji kluczy realnego IdP ani testów obciążenia. GATE-04 PASS dla tych 12 testów; wszystkie trzy punkty PARTIAL na poziomie integracji pełnego systemu.
