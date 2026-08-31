# Owner Sign-In Methods (Google & Apple)

Source-of-truth implementation plan for optional **Google** and **Apple** owner sign-in, alongside the existing CheckStation email + password flow.

For security requirements see [SECURITY.md](./SECURITY.md). For tenant/auth architecture see [ARCHITECTURE.md](./ARCHITECTURE.md). Confirmed decision summary: [DEC-094](./DECISIONS.md#dec-094--optional-google-and-apple-owner-sign-in-methods).

---

## Document Status

| Field | Value |
|-------|-------|
| **Status** | Approved plan; **Phase 7 (security/regression audit) complete** |
| **Created** | 2026-08-31 |
| **Scope** | Paying owner (`accounts.User`) only — not staff, not platform admin |
| **Out of scope** | WorkspaceStaffAccount login, Django `/admin/` authentication, Group email OAuth |

---

## Owner sign-in methods

A CheckStation owner account may independently support:

- CheckStation **email + password**
- **Google**
- **Apple**

All methods belong to the same existing `accounts.User`. Google/Apple must **never** create a separate parallel owner identity once linked.

**Invariant:** at least one sign-in method must always remain available.

### Initial implementation rules

- Once a CheckStation password has been created, there is **no UI for removing the password**.
- Google and Apple can be **connected/disconnected**, subject to the last-sign-in-method rule.
- Existing password accounts continue working **unchanged**.
- Existing users are **not** automatically migrated or linked to Google/Apple.

---

## Google/Apple identity

Use a dedicated provider-link model (`OwnerAuthProviderLink`).

The canonical OAuth identity is:

**`provider` + `provider_subject`**

where `provider_subject` is the stable OIDC `sub`.

Provider email is an **informational snapshot only** and must **not** become the canonical identity. Do **not** automatically change the CheckStation primary email when a Google/Apple email changes.

---

## Existing-account collision rule

Do **not** automatically merge accounts based only on matching email.

If someone attempts Google/Apple login and:

- there is **no** provider link for that `sub`, but
- the verified provider email is already claimed by an existing CheckStation account,

then:

- do **not** create a duplicate account, and
- do **not** silently link it.

Require the user to sign in to the existing CheckStation account first and explicitly connect Google/Apple from **Account → Security**.

---

## OAuth-first accounts

A brand-new owner may eventually register using Google or Apple. Such a user will:

- use the existing `accounts.User`
- initially have an **unusable** Django password (`set_unusable_password()`)
- receive normal verified-owner workspace provisioning (`provision_verified_owner`)
- later be able to **create** a CheckStation password from Account → Security

Once created, password login becomes an additional independent sign-in method.

---

## CheckStation 2FA

Owner 2FA remains a **CheckStation-level** second factor (`OwnerTOTPDevice`).

If enabled, it must apply after **every** first-factor login:

| First factor | Then |
|--------------|------|
| email/password | CheckStation 2FA challenge |
| Google | CheckStation 2FA challenge |
| Apple | CheckStation 2FA challenge |

OAuth must **never** bypass existing owner 2FA. Reuse the existing pending-owner-2FA session architecture (`begin_pending_owner_2fa`, `OwnerTOTPLoginChallengeView`).

Do **not** modify platform-admin 2FA (`PlatformTOTPDevice`, `/admin/two-factor/`).

---

## Sensitive actions for OAuth-only users — V1 decision

Do **not** implement OAuth popup/re-authentication step-up flows in V1.

Current sensitive account operations already depend on `current_password`. For an OAuth-only owner who has no usable CheckStation password, require them to **set a CheckStation password first** before password-gated sensitive actions, including:

- changing primary email
- changing/removing backup email (where password confirmation is required)
- owner 2FA setup/disable/recovery-code security actions (where password is required)
- account deletion
- other owner password-reauthenticated security actions

This preserves the existing security architecture and minimizes risk.

---

## Workspace UI target

Eventually **Account → Security** will contain:

1. **Email** — primary/login email; optional backup email (existing add/change/remove behavior)
2. **Sign-in methods** — Password, Google, Apple (Connected / Not connected; Connect / Disconnect)
3. **Change Password / Set Password** — `Change password` when password exists; `Set password` for OAuth-only owners
4. **Two-factor authentication** — existing owner TOTP flow
5. **Delete account** — existing Danger Zone

---

## Public auth target

Eventually owner **Login** and **Register** screens will support:

- email/password
- Continue with Google
- Continue with Apple

**Staff login** (`Workspace ID` + username + password) remains completely separate and unchanged.

---

## Staff / platform isolation

Do **not** add Google or Apple login to:

- `WorkspaceStaffAccount`
- workspace-ID + username/password staff login
- platform admin authentication

---

## Data model (Phase 1+)

`OwnerAuthProviderLink` (`accounts` app):

| Field | Purpose |
|-------|---------|
| `user` | FK → `accounts.User` (CASCADE on permanent delete) |
| `provider` | `google` \| `apple` |
| `provider_subject` | Stable OIDC `sub` |
| `provider_email` | Optional snapshot at link time |
| `provider_email_verified` | Whether provider asserted verified email |
| `linked_at` | Auto-set on create |
| `last_used_at` | Optional; updated on successful OAuth login (later phases) |

**Constraints:**

- unique `(provider, provider_subject)` globally
- unique `(user, provider)` — at most one Google and one Apple link per user

**Password** is not stored in this table; use `User.has_usable_password()`.

---

## Implementation phases

### Phase 1 — Identity foundation ✅

- Provider-link database model and constraints
- Sign-in-method status helpers (`sign_in_methods_payload`)
- Migration
- Backend unit/model tests
- **No** OAuth network/provider integration

### Phase 2 — Shared owner authentication completion ✅

- Module: `backend/accounts/owner_authentication.py`
- `complete_owner_authentication(request, user)` — post-first-factor entry point (email verification, active workspace, owner 2FA gate, session establishment)
- `establish_owner_session(request, user)` — lower-level session + workspace payload (used after successful 2FA challenge)
- `build_owner_workspace_payload()` / `get_active_owner_organization()` — shared workspace response builders
- `OwnerLoginView` delegates to `complete_owner_authentication` after password `authenticate()`
- `OwnerTOTPLoginChallengeView` uses `establish_owner_session` after challenge success (payload now includes `account_mode` / `workspace_status` for parity with password login)
- Tests: `backend/accounts/tests_owner_authentication.py`

### Phase 3 — Google OAuth ✅

**Backend-only.** No public Login/Register buttons yet (Phase 6). No Account → Security link UI yet (Phase 5).

#### Architecture

| Module | Responsibility |
|--------|----------------|
| `accounts/google_oauth_settings.py` | Config helpers, redirect URI, frontend result URL |
| `accounts/google_oauth_state.py` | Session-bound OAuth `state` + OIDC `nonce` lifecycle |
| `accounts/google_oauth_client.py` | Google authorize URL, code exchange, ID token verification (`google-auth`) |
| `accounts/google_oauth.py` | Login / register / link business logic |
| `accounts/google_oauth_views.py` | Start + callback HTTP views |
| `accounts/tests_google_oauth.py` | Mocked integration tests (no real Google network calls) |

#### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/auth/google/start/?intent=login` | Begin Google login |
| `GET` | `/api/auth/google/start/?intent=register&legal_acknowledgement=true` | Begin Google registration |
| `GET` | `/api/auth/google/start/?intent=link` | Begin Google link (authenticated owner session required) |
| `GET` | `/api/auth/google/callback/` | Google redirect target; validates state, exchanges code, completes flow |

Callback redirect URI defaults to the incoming request’s absolute `/api/auth/google/callback/` URL. Override with `GOOGLE_OAUTH_REDIRECT_URI` when needed.

#### Callback result transport

Google → backend callback → validation/exchange → session side effects → **redirect** to:

`{FRONTEND_BASE_URL}/auth/google/result?code=<result_code>`

No access tokens, ID tokens, client secrets, or raw provider errors are placed in the redirect URL.

Result codes include: `success`, `two_factor_required`, `linked`, `already_linked`, `existing_account_connect_required`, `no_account`, `google_already_linked`, `different_google_linked`, `legal_acknowledgement_required`, `oauth_not_configured`, `invalid_state`, `authentication_failed`, `email_not_verified`, `email_missing`, `authentication_required`.

Phase 6 frontend should read `code` and render the appropriate UX (including routing to the existing owner 2FA challenge UI when `two_factor_required`).

#### OAuth state + nonce

Stored in the CheckStation session (`_owner_google_oauth_pending`):

- cryptographically random `state` + `nonce`
- `intent` (`login` / `register` / `link`)
- `session_key` binding
- `owner_user_id` for link flows
- `legal_acknowledgement` for register flows
- `created_at` with TTL (`GOOGLE_OAUTH_STATE_TTL_SECONDS`, default 600s)

State is single-use and cleared on successful consumption or terminal failure. ID token verification enforces issuer, audience/client ID, expiry (via `google-auth`), and nonce match.

#### Login flow (returning linked owner)

1. `GET /api/auth/google/start/?intent=login`
2. Google authenticates user
3. Callback finds `OwnerAuthProviderLink` by `(google, sub)`
4. Updates provider email snapshot + `last_used_at` only (never `User.email`)
5. `complete_owner_authentication(request, user)` → session or `two_factor_required`

Unknown `sub` + claimed email → `existing_account_connect_required`. Unknown `sub` + unclaimed email → `no_account`.

#### Registration flow (new owner)

Requires `legal_acknowledgement=true` on start (same requirement as password `RegisterOwnerSerializer`).

Callback creates one `accounts.User` with:

- normalized verified primary email
- `set_unusable_password()`
- one `OwnerAuthProviderLink`
- `provision_verified_owner(user)` (existing service; includes builtin trial behavior)

Then `complete_owner_authentication(request, user)`.

Unverified/missing Google email rejected. Email collision rejected (no duplicate User, no auto-link).

**Phase 6 frontend:** must pass `legal_acknowledgement=true` when starting Google registration (e.g. after the same Terms/Privacy checkbox used on `RegisterScreen`).

#### Link flow (authenticated owner)

1. Owner has normal CheckStation session
2. `GET /api/auth/google/start/?intent=link`
3. Callback verifies session user matches stored `owner_user_id`
4. Creates link if none exists; idempotent if same `sub` already linked to this owner
5. Redirect `linked` / `already_linked`

Does not modify `User.email`, password, backup email, workspace, or 2FA. Rejects `sub` owned by another user or a different Google link on the same owner.

#### Configuration

See `.env.example`. Required for Google flows:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Optional:

- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_OAUTH_STATE_TTL_SECONDS` (default 600)
- `GOOGLE_OAUTH_HTTP_TIMEOUT_SECONDS` (default 15)

When unset, Google endpoints return `503 oauth_not_configured`; password login is unaffected.

Dependency: `google-auth` (ID token verification). Token exchange uses stdlib `urllib` (same pattern as Turnstile/Resend).

**Phase 5 note:** unlink endpoint/UI still pending; link creation already uses Phase 1 `can_unlink_owner_provider()` helpers for later enforcement.

### Phase 4 — Apple OAuth ✅

**Backend-only.** Mirrors Google architecture with Apple-specific differences.

#### Architecture

| Module | Responsibility |
|--------|----------------|
| `accounts/apple_oauth_settings.py` | Config helpers, redirect URI, frontend result URL |
| `accounts/apple_oauth_state.py` | Session-bound OAuth `state` + OIDC `nonce` lifecycle |
| `accounts/apple_oauth_client.py` | Authorize URL, ES256 client-secret JWT, code exchange, JWKS ID token verify |
| `accounts/apple_oauth.py` | Login / register / link business logic |
| `accounts/apple_oauth_views.py` | Start + callback HTTP views |
| `accounts/tests_apple_oauth.py` | Mocked integration tests |

#### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/auth/apple/start/?intent=login` | Begin Apple login |
| `GET` | `/api/auth/apple/start/?intent=register&legal_acknowledgement=true` | Begin Apple registration |
| `GET` | `/api/auth/apple/start/?intent=link` | Begin Apple link (authenticated owner) |
| `POST` | `/api/auth/apple/callback/` | Apple `form_post` redirect target (GET fallback for errors) |

Callback redirect URI defaults to `/api/auth/apple/callback/`; override with `APPLE_OAUTH_REDIRECT_URI`.

#### Apple client secret

Apple token exchange requires a server-generated **ES256 JWT client secret** (not a static string). Generated per request in `generate_apple_client_secret()`:

- `iss` = Team ID
- `sub` = Services ID (`APPLE_OAUTH_CLIENT_ID`)
- `aud` = `https://appleid.apple.com`
- `kid` = Key ID
- signed with `APPLE_OAUTH_PRIVATE_KEY` (PEM; `\\n` escapes supported in `.env`)
- short expiration (~5 minutes)

Never exposed to the frontend.

Dependency: `PyJWT` (+ existing `cryptography` for key loading). JWKS verification via `PyJWKClient` against `https://appleid.apple.com/auth/keys`.

#### Private relay / missing email

- Canonical identity: `(apple, sub)` — never provider email
- Returning linked login works when Apple omits email (lookup by `sub` only)
- Provider email snapshot updates only when Apple supplies a new email; **never** changes `User.email`
- `privaterelay.appleid.com` addresses are valid provider-email snapshots and registration emails
- New registration requires a usable verified email; missing email → `email_missing`

#### Callback result transport

Redirect to `{FRONTEND_BASE_URL}/auth/apple/result?code=<result_code>` (parallel to Google).

Result codes mirror Google (`success`, `two_factor_required`, `linked`, `existing_account_connect_required`, `apple_already_linked`, etc.).

#### 2FA

Apple login/register call `complete_owner_authentication(request, user)` — same CheckStation 2FA gate as password/Google.

#### Name handling (V1)

Apple may supply `user.name` only on first authorization. CheckStation owner registration does not require name fields today; **name is ignored** for V1. Provider identity does not depend on name.

**Phase 6:** complete — public Login/Register Google/Apple buttons and `/auth/*/result` handling.

### Phase 6 — Public Login/Register UI ✅

**Status:** Complete (2026-08-31).

#### Public UI

- `OwnerLoginScreen.jsx` — email/password unchanged; **Continue with Google/Apple** below an `or` divider; full-page redirect to backend OAuth start (`intent=login`).
- `RegisterScreen.jsx` — password registration unchanged; OAuth register buttons respect the existing legal acknowledgement checkbox (no OAuth start until accepted; then `legal_acknowledgement=true`).
- `AuthProviderButtons.jsx` — shared provider buttons + divider.
- `OwnerOAuthResultScreen.jsx` — shared result handler for `/auth/google/result` and `/auth/apple/result`.
- `ownerOAuthPublicUi.js` — start URLs, result messages, result actions.

Staff login and platform admin auth are unchanged.

#### Result routes

| Route | Backend redirect |
|-------|------------------|
| `/auth/google/result?code=...` | `FRONTEND_BASE_URL/auth/google/result?code=...` |
| `/auth/apple/result?code=...` | `FRONTEND_BASE_URL/auth/apple/result?code=...` |

Account → Security link/verify results remain on `/account/security?oauth=...&result=...` (Phase 5).

#### Success (`code=success`)

1. `api.loadWorkspace()` hydrates canonical Django session state.
2. `onSignedIn({ workspace })` updates app session (same as password login).
3. Navigate to `/dashboard`.

#### Two-factor (`code=two_factor_required`)

Redirect to `/login?two_factor=1` and reuse the existing owner 2FA challenge form (`POST /api/auth/owner-2fa/challenge/`). No separate OAuth 2FA UI.

#### Key result codes (public)

| Code | UX |
|------|-----|
| `success` | Enter workspace |
| `two_factor_required` | Owner login 2FA challenge |
| `no_account` | Message + link to Register |
| `existing_account_connect_required` | Message to sign in first, then connect from Account → Security |
| `legal_acknowledgement_required` | Message + link to Register |
| `authentication_failed`, `invalid_state`, `oauth_not_configured`, `email_missing`, `email_not_verified` | Safe concise error + retry/login/register links |

Raw provider errors are never shown.

#### Legal acknowledgement (register OAuth)

OAuth registration buttons call the same checkbox state as password registration. If unchecked, show the existing validation message and do not navigate. Only when checked does the start URL include `legal_acknowledgement=true`.

#### Tests

- Frontend: `ownerOAuthPublicUi.test.js`, `OwnerLoginScreen.test.js`, `RegisterScreen.test.js` extensions — **15 tests passed**
- Backend regression (with PyJWT installed): Google/Apple OAuth, sign-in methods, owner auth, password auth, owner 2FA — **135 tests passed**

#### Dependency note (PyJWT)

`PyJWT>=2.10,<3` is declared in `backend/requirements.txt`. If the backend image was built before this dependency was added, run:

```bash
docker compose build backend
```

(or reinstall requirements in the backend environment). Apple client-secret tests require `jwt` (PyJWT) at runtime.

#### Manual provider configuration still required

Real Google/Apple login requires provider console setup and environment variables (see **Environment variables** below). Automated tests mock OAuth; no production credentials are committed.

**Google Cloud Console (still required for real login)**

1. Create OAuth 2.0 Client ID (Web application).
2. Authorized redirect URI: backend callback (e.g. `http://localhost:8000/api/auth/google/callback/` or production equivalent).
3. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in `.env`.
4. Ensure `FRONTEND_BASE_URL` matches where the React app is served (result redirect target).

**Apple Developer (still required for real login)**

1. Create a Services ID for Sign in with Apple.
2. Configure return URL: backend callback (e.g. `http://localhost:8000/api/auth/apple/callback/`).
3. Create a Sign in with Apple key; download `.p8` private key.
4. Set `APPLE_OAUTH_CLIENT_ID`, `APPLE_OAUTH_TEAM_ID`, `APPLE_OAUTH_KEY_ID`, `APPLE_OAUTH_PRIVATE_KEY` in `.env`.
5. Ensure `FRONTEND_BASE_URL` is correct.

**Local `.env`**

Copy from `.env.example` and fill OAuth variables before testing real redirects. Without them, start endpoints return `503 oauth_not_configured` and the UI shows a safe error after redirect.

### Phase 5 — Account Security sign-in methods ✅

**Status:** Complete (2026-08-31).

#### Routes added

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/auth/set-password/` | OAuth-only owners create first CheckStation password |
| `POST` | `/api/auth/google/unlink/` | Disconnect Google from current owner |
| `POST` | `/api/auth/apple/unlink/` | Disconnect Apple from current owner |
| `GET` | `/api/auth/google/start/?intent=verify` | OAuth re-verification (workspace security) |
| `GET` | `/api/auth/apple/start/?intent=verify` | OAuth re-verification (workspace security) |

Link intents redirect to `/account/security?oauth={google|apple}&result=...` (not public `/auth/*/result`).

#### Set Password security (final V1)

- Allowed only when `has_usable_password() == False`.
- **If owner 2FA is enabled:** require TOTP or recovery code (no OAuth step-up).
- **If owner 2FA is not enabled:** require recent OAuth re-verification via `intent=verify` on a **linked** provider identity (`sub` must match stored link). Session cookie alone is insufficient.
- Re-auth is stored in session (`_owner_oauth_reauth`, 10-minute TTL).
- Uses same Django password validators as registration/change password; requires confirmation.
- On success: `set_password`, session preserved via `update_session_auth_hash`; provider links unchanged.
- If password already exists: `400 password_already_set` → use Change password.

#### Unlink security (final V1)

- Server-side `can_unlink_owner_provider()` enforced; `400 last_sign_in_method` when final method.
- **Password-enabled owner:** `current_password` + owner 2FA (if enabled).
- **OAuth-only owner:** fresh OAuth `intent=verify` from **another** linked provider (not the one being unlinked) + owner 2FA (if enabled).
- Unlink does not affect `User.email`, password, workspace, 2FA, or the other provider.

#### OAuth-only sensitive actions

Password-gated owner endpoints return `400` with `code: password_not_available` and message: *"Set a CheckStation password before performing this security-sensitive action."*

Applies to: primary/backup email changes, owner 2FA setup/disable/recovery regeneration, account deletion, change password.

Phase 5 does **not** add OAuth step-up to those endpoints.

#### UI (Account → Security)

New **Sign-in methods** accordion (`AccountSignInMethodsPanel.jsx`):

- Password: Connected / Not set → Change password (opens existing accordion) or Set password form
- Google / Apple: Connected / Not connected, provider email snapshot, Connect / Disconnect
- Disconnect disabled with explanation when `can_unlink_*` is false
- OAuth link/verify results handled via `?oauth=&result=` on `/account/security`

#### Tests

- Backend: `backend/accounts/tests_sign_in_method_management.py`
- Frontend: `frontend/src/signInMethodsUi.test.js`
- Regression helpers updated in Google/Apple OAuth tests for account-security redirect query param `result`.

### Phase 7 — Regression/security/docs ✅

**Status:** Complete (2026-08-31).

#### Environment (dev Docker)

| Check | Result |
|-------|--------|
| Pending migrations | None — `accounts.0006_owner_auth_provider_links` applied |
| PyJWT in backend image | Present (rebuilt image includes `PyJWT>=2.10,<3`) |
| `/api/auth/account/` | 200 with `sign_in_methods` payload |

Commands used during audit:

```bash
docker compose exec -T backend python manage.py showmigrations
docker compose exec -T backend python manage.py migrate --noinput
docker compose build backend && docker compose up -d backend
```

#### Security audit summary

| Area | Result |
|------|--------|
| **Architecture** | Password, Google, Apple authenticate the same `accounts.User`; no parallel OAuth user model |
| **Provider identity** | Canonical `(provider, provider_subject)`; email snapshot-only; no auto-link by email |
| **Account collision** | Unknown sub + existing email → `existing_account_connect_required`; no duplicate User |
| **OAuth state** | Random state/nonce, session-bound, TTL, single-use; intent-specific handlers |
| **Token validation** | Google: google-auth verify (sig, iss, aud, exp, nonce, sub). Apple: JWKS RS256 + iss/aud/exp/nonce/sub; ES256 client-secret server-side only |
| **2FA bypass** | All OAuth login/register paths use `complete_owner_authentication()`; `establish_owner_session()` only after 2FA challenge |
| **Last-method invariant** | Server-side `can_unlink_owner_provider()`; `400 last_sign_in_method` |
| **OAuth-only owners** | Unusable password; `password_not_available` on sensitive endpoints; set-password requires OAuth verify or 2FA |
| **Account deletion** | Provider links CASCADE with User; sub reusable after permanent delete |
| **Staff isolation** | No OAuth on staff login |
| **Platform admin** | Unchanged; owner OAuth isolated from `/admin/` |
| **Public UI** | Safe result codes only in URLs; legal acknowledgement required for OAuth register |

#### Tests added (Phase 7)

`backend/accounts/tests_owner_oauth_security_audit.py` — 2FA gate, deletion cascade, sensitive-action sweep, single-use state.

#### Regression results (Phase 7 run)

| Suite | Result |
|-------|--------|
| Google + Apple OAuth + sign-in methods + management + owner auth + password + 2FA + email | **171 passed** |
| Phase 7 security audit | **6 passed** |
| Deletion (+ audit deletion cases) | **22 passed**, 1 unrelated pre-existing failure |
| Frontend auth/OAuth/sign-in methods | **22 passed** |
| Frontend production build | **OK** |

**Known unrelated failure (not fixed in Phase 7):** `DjangoAdminPermanentDeleteTests.test_ordinary_admin_delete_still_archives` (403 vs 302).

#### Production deployment checklist

**Google Cloud Console**

1. Configure OAuth consent screen (app name, support email, scopes: openid, email, profile).
2. Create **Web application** OAuth client.
3. Authorized redirect URI(s):
   - Local: `http://localhost:8000/api/auth/google/callback/`
   - Production: `https://<api-host>/api/auth/google/callback/`
4. Set env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, optional `GOOGLE_OAUTH_REDIRECT_URI`.
5. Set `FRONTEND_BASE_URL` to the React app origin (result redirect target).

**Apple Developer**

1. Enable Sign in with Apple on App ID (if required for your setup).
2. Create **Services ID** (this becomes `APPLE_OAUTH_CLIENT_ID`).
3. Configure **Website** domain and **Return URL**:
   - Local: `http://localhost:8000/api/auth/apple/callback/`
   - Production: `https://<api-host>/api/auth/apple/callback/`
4. Create Sign in with Apple **Key**; note Key ID and Team ID; store `.p8` private key securely.
5. Set env: `APPLE_OAUTH_CLIENT_ID`, `APPLE_OAUTH_TEAM_ID`, `APPLE_OAUTH_KEY_ID`, `APPLE_OAUTH_PRIVATE_KEY`.
6. Set `FRONTEND_BASE_URL`.

**Django / production**

- `CSRF_TRUSTED_ORIGINS` and CORS must include frontend and API origins used in production.
- Apple callback uses `response_mode=form_post`; ensure HTTPS in production.
- Never commit real OAuth secrets or private keys (see `.env.example` placeholders only).
- Repository implementation is complete; **real end-to-end login requires provider-console credentials** to be configured per environment.

#### Manual smoke (local, without real provider credentials)

Verified via automated tests and HTTP checks:

- Password owner login → workspace hydration
- `GET /api/auth/account/` → 200 with `sign_in_methods`
- OAuth start URLs reachable (503 when unconfigured)
- Staff login unchanged (no OAuth buttons)
- Account → Security sign-in-method UI uses canonical API payload

**Not exercised without real Google/Apple credentials:** full provider redirect round-trip in browser.

---

## Key files (by phase)

| Area | Files |
|------|-------|
| Model | `backend/accounts/owner_auth_provider_models.py` |
| Helpers | `backend/accounts/sign_in_methods.py` |
| Post-first-factor auth | `backend/accounts/owner_authentication.py` |
| Google OAuth | `backend/accounts/google_oauth*.py` |
| Apple OAuth | `backend/accounts/apple_oauth*.py` |
| Account payload | `backend/accounts/email_management.py`, `backend/accounts/serializers.py` |
| Password login | `backend/organizations/views.py` (`OwnerLoginView`) |
| Owner 2FA | `backend/accounts/owner_two_factor.py`, `owner_two_factor_views.py` |
| Sign-in management | `backend/accounts/owner_sensitive_auth.py`, `owner_sign_in_method_views.py` |
| Account UI | `frontend/src/AccountScreen.jsx`, `AccountSignInMethodsPanel.jsx`, `signInMethodsUi.js` |
| Public auth UI | `frontend/src/OwnerLoginScreen.jsx`, `RegisterScreen.jsx`, `AuthProviderButtons.jsx`, `OwnerOAuthResultScreen.jsx`, `ownerOAuthPublicUi.js` |

---

## Environment variables

### Google OAuth (Phase 3 — implemented)

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` (optional; defaults to backend callback URL)
- `GOOGLE_OAUTH_STATE_TTL_SECONDS` (optional; default 600)
- `GOOGLE_OAUTH_HTTP_TIMEOUT_SECONDS` (optional; default 15)

Frontend result redirect uses `FRONTEND_BASE_URL` → `/auth/google/result?code=...`

### Apple OAuth (Phase 4 — implemented)

- `APPLE_OAUTH_CLIENT_ID` (Services ID)
- `APPLE_OAUTH_TEAM_ID`
- `APPLE_OAUTH_KEY_ID`
- `APPLE_OAUTH_PRIVATE_KEY` (PEM; escaped `\\n` supported)
- `APPLE_OAUTH_REDIRECT_URI` (optional)
- `APPLE_OAUTH_STATE_TTL_SECONDS` (optional; default 600)
- `APPLE_OAUTH_HTTP_TIMEOUT_SECONDS` (optional; default 15)

Frontend result redirect uses `FRONTEND_BASE_URL` → `/auth/apple/result?code=...`

When unset, Apple endpoints return `503 oauth_not_configured`; password and Google login are unaffected.

---

## How to use this document

1. Implement phases in order; do not skip ahead without approval.
2. Update the **Document Status** table when a phase completes.
3. Surface review-worthy deviations in [DECISIONS.md](./DECISIONS.md) before silently changing behavior.
