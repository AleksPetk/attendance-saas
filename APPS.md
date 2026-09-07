# CheckStation Mobile + Desktop Applications

Hand-off document for continuing native app work (Codex / humans).

## Architecture chosen

| Layer | Choice | Why |
|---|---|---|
| Mobile | **Expo SDK 57** (React Native **0.86.3**, React **19.2.3**) + Expo Router | Matches `PROJECT.md`. One codebase for iPhone, iPad, Android phone/tablet. |
| Desktop | **Electron + Vite + React** | Purpose-built desktop UI (not a WebView of the Workspace SPA). Shares TypeScript packages with mobile. macOS + Windows from one app. |
| Shared | `packages/*` TypeScript | API client, auth controller, domain helpers, i18n, config — no duplicated Django logic. |

**Not chosen:** wrapping `workspace.checkstation.app` in a WebView; React Native macOS/Windows (less mature for this product’s desktop density); Flutter (would fork away from TS/React stack).

### Isolation rule (non-negotiable)

- Do **not** redesign or refactor `frontend/` (promo + Workspace web).
- Do **not** change backend auth/billing product rules unless a documented native gap requires a minimal, reviewed API addition.
- Native apps consume `https://workspace.checkstation.app/api/` (or local `http://localhost:8000/api`).

## Folder structure

```
apps/
  mobile/          Expo app (iOS / iPadOS / Android)
  desktop/         Electron + Vite React (macOS / Windows)
packages/
  api/             Cookie-jar HTTP client, errors, endpoints
  auth/            AuthController (owner/staff/2FA/bootstrap/logout)
  domain/          Entitlements + kiosk action helpers
  i18n/            EN/JA strings + date formatting
  config/          Environment / API base validation
frontend/          EXISTING WEB — do not casually change
backend/           EXISTING API — do not casually change
APPS.md            This file
```

## Shared vs platform responsibilities

**Shared (`packages/`)**
- API base URL + timeouts
- Cookie + CSRF session client (mirrors SPA; no JWT yet)
- Auth bootstrap / login / logout / 2FA challenge
- Entitlement helpers (UI hints; backend authoritative)
- Kiosk allowed-action helpers (mirror backend rules)
- EN/JA translations

**Mobile (`apps/mobile`)**
- Bottom tabs: Home, Groups, People, History, More
- Stacks for detail / account / plan / staff / help / security
- Full-screen kiosk route
- SecureStore-backed cookie jar + `expo/fetch` (better Set-Cookie visibility than stock RN fetch)
- Sends `Origin` / `Referer` = API host origin so Django 5 CSRF accepts native POSTs
- Absorbs `csrfToken` from `/auth/csrf/` JSON body (does not rely solely on Set-Cookie)
- Phone + tablet layout via `useWindowDimensions`

**Desktop (`apps/desktop`)**
- Persistent sidebar shell
- Dense main content region
- Same feature routes + kiosk full-window mode
- **Main-process** session jar (IPC `checkstation:http`); encrypted via `safeStorage` under Electron `userData` — **not** renderer `localStorage`

## Auth / session model

Production web auth is **Django session cookie + CSRF** (`checkstation_sessionid`, `checkstation_csrftoken`). There is **no** first-class native JWT.

Native / desktop clients:
1. Maintain a cookie jar (mobile SecureStore / Electron main process)
2. `GET /api/auth/csrf/` — store token from Set-Cookie **and/or** JSON `csrfToken`
3. Send `Origin` + `Referer` (API host), `Cookie`, and `X-CSRFToken` on mutating requests
4. Owner: `POST /api/auth/login/` (+ optional `POST /api/auth/owner-2fa/challenge/`)
5. Staff: `POST /api/auth/staff-login/`
6. Bootstrap: `GET /api/workspace/`
7. Logout / session-expiry clears the jar (and Electron encrypted file)

### Production API connectivity

| Concern | Status |
|---|---|
| Base URL | `https://workspace.checkstation.app/api` (prod); localhost in dev |
| HTTPS | Required for production config (`@checkstation/config`) |
| CORS | **Mobile native** is not a browser CORS client. **Electron main** fetch also bypasses renderer CORS. Vite-only browser preview of desktop is CORS-sensitive and is not the shipping path. |
| CSRF | Client sends API-host `Origin` (Django `good_origin`); no backend loosening required for cookie+CSRF login |
| Backend changes for this foundation pass | **None** |

### Known backend gaps (do not hack around)

1. **OAuth** — Google/Apple callbacks redirect to the **web** `FRONTEND_BASE_URL`. Native ASWebAuthenticationSession / deep links need a reviewed backend callback contract.
2. **Token auth** — optional future; cookie jar is the foundation path without weakening browser security.
3. **Native store billing** — not implemented; plan screen shows entitlement/billing **state** only.
4. **Native ads** — abstract only; no AdSense / AdMob in this foundation.
5. **RN Set-Cookie edge cases** — if a specific device runtime still strips Set-Cookie from `expo/fetch`, session establishment fails until that runtime is fixed or a reviewed native CookieManager (dev build) is added. CSRF JSON body path already covers CSRF.

## Navigation

### Mobile
- Auth gate → `/(auth)/sign-in` or `/(app)/(tabs)/*`
- Kiosk lock → `/kiosk/[groupId]` full-screen modal
- More → Account, Plan, Staff, Help, language, logout

### Desktop
- Sidebar: Home, Groups, People, History, Staff, Plan, Account, Help
- `/kiosk/:groupId` outside shell (no sidebar chrome)

## Kiosk foundation

- Enter via `POST /api/groups/:id/kiosk/`
- Identify / perform / exit use real APIs
- Local `getValidActionsForState` only mirrors allowed actions; server remains authoritative
- Multi-device still intentional (session lock ≠ attendance mutex)
- Large touch targets; portrait + landscape aware on mobile

## Localization

- Packages: `@checkstation/i18n` with `en` / `ja`
- Runtime locale switch in More (mobile) and sidebar (desktop)
- Date/time via `Intl`

## How to run

Root install (once):

```bash
npm install
```

### Mobile

```bash
npm run mobile          # Expo dev server
npm run mobile:ios      # iOS Simulator (macOS + Xcode)
npm run mobile:android  # Android emulator / device
```

Env: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api` (default in app.json extra).

Bundle IDs (placeholders): `app.checkstation.mobile`

### Desktop

```bash
npm run desktop         # Vite :5174 + Electron
npm run desktop:build   # Vite build + electron-builder --dir
```

Env: `VITE_API_BASE_URL=http://localhost:8000/api`

App IDs: `app.checkstation.desktop`

Packaging: `npm run build -w @checkstation/desktop` runs the Vite renderer build. Full Electron dir packaging is `npm run build:electron -w @checkstation/desktop` (requires a complete `electron-builder` / `app-builder-bin` install with postinstall scripts allowed).

### Packages

```bash
npm run test:packages
npm run typecheck
```

### Web (unchanged)

```bash
cd frontend && npm test:… / npm run build
```

## Platform status

| Platform | Status |
|---|---|
| iPhone / iPad | Expo project + tablet-aware layouts; run via Simulator when Xcode available |
| Android | Same Expo project; run via emulator when SDK available |
| macOS | Electron app boots in dev; `--dir` build configured |
| Windows | Same Electron project; build from Windows CI/agent (`electron-builder --win`) — validate on Windows host |

## Screens implemented (foundation level)

Home, Groups list/detail, People list/detail, History, Staff, Account, Security (OAuth gap note), Plan (read-only), Help, Sign-in (owner/staff/2FA), Kiosk identify/perform/exit.

Polish, email-sender editors, kiosk builder, attendance report exports UI, etc. are follow-ups for Codex screen-by-screen.

## What Codex must NOT change casually

- `frontend/` promo or Workspace web UX
- Billing/subscription business rules / Stripe Live web checkout
- Backend security rate limits, multi-tenancy, kiosk lock semantics
- Inventing native IAP without OPEN-015 research
- Turning apps into WebViews of the website

## Next Codex work (suggested order)

1. Native OAuth deep-link design + minimal backend callback support (reviewed)
2. Polish iPhone/iPad navigation + Groups/People forms
3. Harden kiosk UX (Class PIN, people grids, confirmation screens)
4. macOS desktop density polish
5. Android validation pass
6. Windows build agent validation
7. Later: App Store / Play billing architecture
