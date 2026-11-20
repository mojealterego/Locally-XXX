# Uruchomienie lokalnej bramki bezpieczeństwa Enterprise

Node >=22.16.0; test: `npm test`. Produkcyjna konfiguracja operatora: `OMEGA_OIDC_ISSUER` (HTTPS, realm), `OMEGA_OIDC_AUDIENCE` (API), `OMEGA_OIDC_CLIENT` (azp dozwolonego klienta), `OMEGA_PDP_URL` (HTTPS do zaufanego PDP przez TLS proxy), `OMEGA_PDP_KEY_FILE` (prywatny plik sekretu), `OMEGA_AIM_DIRECTORY` (istniejący prywatny katalog chmod 0700). PORT domyślnie 3000. `npm start` uruchamia tylko loopback.

W Keycloak skonfigurować standard flow + PKCE S256, dokładne redirect URI i origins, wyłączyć implicit/direct grants dla publicznego klienta, audience mapper API, RS256 oraz ważność access tokena ≤900 sekund. Claim `omega_tenant` UUID wyłącznie z atrybutu zarządzanego przez administratora. Permit: synchronizacja użytkowników wg sub i tenantów UUID, zasób Agent i działania read/interact/assign_tasks/create/delete/approve/delegate. Polityki per tenant i zasób, bez default tenant. Senior Architect: uprawnienia przydzielane odrębnie, Data Analyst: read/interact/assign_tasks bez delegate, review: approve wyłącznie na konkretnym zasobie. Nie kopiować przykładowych stałych haseł. Przed publicznym dostępem: TLS, rate-limit/reverse proxy, readiness, audyt, klastrowa baza i integracja z właściwym gateway.

API (JSON POST, Authorization Bearer):
- /api/auth/check: human access token; {tenant,agent,action} — werdykt.
- /api/aim/issue: human access token; {tenant,agent,scopes,ttl} — token i expires.
- /api/aim/check: AIM token; {tenant,agent,action} — przypisany subject i zakres.
- /api/aim/revoke: human access token; {token} — unieważnienie własnego grantu.
Nie publikować tokenów w logach. Endpoint check nie zastępuje autoryzacji w miejscu wykonywania operacji.
