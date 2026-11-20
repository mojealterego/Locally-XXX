# Uruchomienie lokalnej bramki bezpieczeństwa Enterprise

Node >=22.16.0; test: `npm test`. Produkcyjna konfiguracja operatora: `OMEGA_OIDC_ISSUER` (HTTPS, realm), `OMEGA_OIDC_AUDIENCE` (API), `OMEGA_OIDC_CLIENT` (azp dozwolonego klienta), `OMEGA_PDP_URL` (HTTPS do zaufanego PDP przez TLS proxy), `OMEGA_PDP_KEY_FILE` (prywatny plik sekretu), `OMEGA_AIM_DIRECTORY` (istniejący prywatny katalog chmod 0700). PORT domyślnie 3000. `npm start` uruchamia tylko loopback.

W Keycloak skonfigurować standard flow + PKCE S256, dokładne redirect URI i origins, wyłączyć implicit/direct grants dla publicznego klienta, audience mapper API, RS256 oraz ważność access tokena ≤900 sekund. Claim `omega_tenant` UUID wyłącznie z atrybutu zarządzanego przez administratora. Permit: synchronizacja użytkowników wg sub i tenantów UUID, zasób Agent i działania read/interact/assign_tasks/create/delete/approve/delegate. Polityki per tenant i zasób, bez default tenant. Senior Architect: uprawnienia przydzielane odrębnie, Data Analyst: read/interact/assign_tasks bez delegate, review: approve wyłącznie na konkretnym zasobie. Nie kopiować przykładowych stałych haseł. Przed publicznym dostępem: TLS, rate-limit/reverse proxy, readiness, audyt, klastrowa baza i integracja z właściwym gateway.

API (JSON POST, Authorization Bearer):
- /api/auth/check: human access token; {tenant,agent,action} — werdykt.
- /api/aim/issue: human access token; {tenant,agent,scopes,ttl} — token i expires.
- /api/aim/check: AIM token; {tenant,agent,action} — przypisany subject i zakres.
- /api/aim/revoke: human access token; {token} — unieważnienie własnego grantu.
Nie publikować tokenów w logach. Endpoint check nie zastępuje autoryzacji w miejscu wykonywania operacji.

## Przegląd projektu agenta i worker

Nowe zależności w backend package.json: pg, BullMQ i Temporal SDK. Wymagane zainstalowanie z zatwierdzonym lockfile przed uruchomieniem. Migracje 001 i 002 w tej kolejności; osobny login DB z członkostwem omega_runtime, bez superuser/BYPASSRLS; provision tenant UUID przez administratora. Compose tylko świeża inicjalizacja, nie automatyczna migracja ani gotowy klaster TLS. Usługi powinny działać przez prywatną sieć i TLS.

Konfiguracja: OMEGA_DB_HOST, OMEGA_DB_PORT, OMEGA_DB_NAME, OMEGA_DB_USER, OMEGA_DB_PASSWORD_FILE, OMEGA_DB_CA_FILE; OMEGA_REDIS_HOST, OMEGA_REDIS_PORT, OMEGA_REDIS_USER, OMEGA_REDIS_PASSWORD_FILE, OMEGA_REDIS_CA_FILE; OMEGA_TEMPORAL_ADDRESS, OMEGA_TEMPORAL_NAMESPACE, OMEGA_TEMPORAL_CA_FILE, OMEGA_TEMPORAL_CERT_FILE, OMEGA_TEMPORAL_KEY_FILE. OIDC i PDP jak powyżej. Rzeczywista autoryzacja namespace i ACL Redis wymagana; skonfigurować serwery i certyfikaty przed startem. Nie uruchamiać na bazie produkcyjnej bez testów migracji.

`npm run start:worker` — worker Temporal oraz BullMQ checks/join. `npm run start:reviews` — API tylko loopback, REVIEW_PORT domyślnie 3001. `npm test` — testy lokalne, nie wymaga pg/Redis/Temporal. Na API JSON POST z Bearer operatora:
- /api/reviews/submit: {id,agent,revision,name,role,tools}; id i agent UUID, revision positive integer. Tenant/subject wyłącznie z JWT, Permit create. Stabilny id, ponowienie z identycznym manifestem. HTTP 202 po potwierdzonym uruchomieniu workflow; jeśli poprzedni workflow zamknięty bez decyzji, żądanie kończy się błędem i wymaga reconciliation.
- /api/reviews/get: {id}; Permit read.
- /api/reviews/decide: {id,digest,approved}; Permit approve i niezależny reviewer. Status APPROVED dotyczy przeglądu strukturalnego, bez wdrożenia.

Długie procesy nie dziedziczą tokenów operatora, sprawdzają aktualną politykę PDP na operacjach workera. Brak pełnego AIM proof-of-possession i atomowego outbox pozostaje otwarty. Dokumentacja API w tej wersji opisuje kod, nie potwierdzone wdrożenie.
