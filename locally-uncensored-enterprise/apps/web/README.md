# Integrated App Ω — lokalny web shell

Z katalogu locally-uncensored-enterprise, Node >=22:

```sh
npm run build:web
npm run start:web
```

Otwórz http://127.0.0.1:4173 na tym samym urządzeniu. Build nie wymaga dostępu do sieci. Domyślny WEB_PORT 4173, REVIEW_PORT 3001; serwer wyłącznie loopback. Nie wystawiać serwera do publicznej sieci. IDE i settings działają bez klastra. Edycja w pamięci sesji, eksportuj przed zamknięciem. Preview ograniczony do bezpiecznego statycznego HTML; nie uruchamia JS/TS.

Przeglądy agentów wymagają osobno uruchomionego backend start:reviews, poprawnego tokenu OIDC i polityki Permit. UI nie wykonuje logowania ani nie wdraża agenta. Wpisanie tokenu z klawiatury tylko w zaufanym środowisku; nie zapisywać tokenów w plikach. Nie uruchamiano prawdziwego klastra.

CLI (po instalacji TypeScript 5.8.3 w workspace dla inspect):
```sh
node packages/cli-tool/cli.mjs inspect ścieżka.ts
node packages/cli-tool/cli.mjs review-get UUID
node packages/cli-tool/cli.mjs review-submit draft.json
node packages/cli-tool/cli.mjs review-decide UUID DIGEST approve
```
Dla review ustaw OMEGA_REVIEW_URL na zaufany origin backendu i OMEGA_REVIEW_TOKEN w zmiennej środowiskowej bez wypisywania w historii poleceń; po użyciu usuń zmienną. SDK @omega/agent-sdk/reviews po instalacji workspace. Testy: npm run test:ui (wymaga TypeScript w ide-studio); opcjonalny compile-only test deklaracji w test/sdk-types.mts. Pełne pnpm install i testy wszystkich pakietów pozostają niewykonane.

18 kafelków, trzy dostępne interfejsy, 15 pozostaje niedostępnych. Nie jest to gotowy APK/PWA ani pełny React 19 IDE. Szczegóły: docs/OMEGA_ENT_UI_EVIDENCE.md w głównym repozytorium.
