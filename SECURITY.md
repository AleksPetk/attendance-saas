# Security Requirements

Security posture and requirements for the Configurable Check-In / Attendance SaaS Platform.

For confirmed decisions, see [DECISIONS.md](./DECISIONS.md). For product scope, see [MVP.md](./MVP.md).

This document records **security requirements and direction**. It does not define implementation details unless explicitly noted.

---

## Authentication and Account Types

### Paying customer User (`accounts.User`)

- Platform-level login for the **paying customer** who owns exactly one Organization (`Organization.owner`).
- That User is the workspace **owner**. They do **not** switch Organizations in one login. Separate **workspaces** require separate paying User accounts.
- Each User account has **one globally unique, normalized (lowercase) email**.
- Paying customers must **verify that email** before they can use the Organization workspace. `email_verified` is separate from Django `is_active`.
- Distinct from **WorkspaceStaffAccount**, Organization **Members**, and other operational participant records.

### Workspace staff account (`WorkspaceStaffAccount`)

- Customer-created **admin** or **staff** login scoped to **exactly one** Organization.
- **Not** an `accounts.User`. **Username is unique per workspace only**; the same username may exist in other workspaces. Optional email uniqueness remains per Organization.
- Staff login uses **Workspace ID + username + password**. The Workspace ID is a system-generated immutable code, not the numeric Organization primary key.
- Paying owners log in with global User email + password and do **not** enter a Workspace ID.
- Login must not use an Organization database PK, workspace-name lookup, or organization switcher.
- Cannot exist globally or move between workspaces.
- Disabling or removing a WorkspaceStaffAccount must **not** destroy that person’s Member attendance history (Members remain unlinked).
- **Workspace Admin** and **Workspace Staff** are customer workspace roles only. They must **never** receive Django `is_staff` / `is_superuser` or access `/admin/`. See [DEC-070](./DECISIONS.md#dec-070--workspace-admin-customer-workspace-permissions).

### Customer workspace authorization (Owner / Admin / Staff)

- **Owner** (`accounts.User` who owns the Organization) retains all workspace operational capabilities plus exclusive billing, Owner account/security, Admin-account management, ownership transfer, and permanent account/workspace deletion.
- **Workspace Admin** (`WorkspaceStaffAccount.role=admin`) may manage almost all operational workspace data and may create/manage **Staff** accounts only. Admin cannot create or manage other Admin accounts, change roles to/from Admin, access Owner account endpoints, billing, or permanent deletion. Enforcement is server-side (`organizations.permissions`); SPA capability flags are UI hints only.
- **Workspace Staff** (`role=staff`) is **Group-scoped** (DEC-071): explicit `WorkspaceStaffGroupAccess` assignments; participant/kiosk/history/report operations within assigned Groups only; no global Members or Group/Kiosk configuration.
- Role authorization and plan entitlements are **both** required; neither overrides the other.

### Platform operator User (`accounts.User` platform-admin flags)

- Uses the same `accounts.User` model as paying customers.
- Django `is_staff` / `is_superuser` are **global** platform-operator flags for the **Django admin site** and future platform-operator tooling.
- Remain **separate from workspace owner/admin/staff**. They are **not** customer workspace roles.

### Member / Participant

- Tracked people inside an Organization workspace. **No workspace access.** Generally **no** SaaS login required.
- Must not be conflated with User accounts or WorkspaceStaffAccounts.

### Local development admin

- The first local platform superuser must be created manually via Django management commands.
- Do not commit credentials or hardcode admin users in code, migrations, or fixtures.

---

## Two-Factor Authentication (2FA)

| Account type | Requirement | Status |
|--------------|-------------|--------|
| **Platform admin / staff** (Django admin and future platform-operator tooling) | **Mandatory TOTP** for `is_staff` / `is_superuser` | Implemented for Django `/admin/` |
| **Paying customer User accounts** (workspace owner login) | **Optional**, but should be **prominently recommended** for account safety | Implemented (owner TOTP; see `OwnerTOTPDevice`) |
| **WorkspaceStaffAccount** (customer-created admin/staff) | Undecided; not designed yet | Not implemented yet |

Platform-operator 2FA uses standard TOTP (Google Authenticator and other TOTP apps). After a correct admin password, the operator is held in a pending admin-session state until setup or a TOTP/recovery-code challenge succeeds. Existing authenticated admin sessions from before this slice may continue until logout; the next `/admin/` login must complete 2FA. Recovery codes are shown once and stored hashed. A successful recovery-code login grants a 10-minute admin-session recovery authorization that can replace a lost authenticator without the old TOTP; that authorization is not granted by an ordinary TOTP admin session. Replacing the authenticator immediately disables the old TOTP secret; old recovery codes are invalidated only after the new authenticator is verified. Break-glass CLI: `python manage.py reset_platform_2fa <email> --yes`. **Owner** optional TOTP uses the same challenge pattern after password **or OAuth** first-factor login (`OwnerTOTPDevice`, pending owner session). WorkspaceStaffAccount login is unchanged and has no 2FA. TOTP secrets are encrypted at rest with `PLATFORM_2FA_ENCRYPTION_KEY` (platform) or owner-equivalent keys for customer owner devices, or a key derived from `SECRET_KEY` in local DEBUG.

### Owner sign-in methods (Google / Apple) — implemented

Confirmed per [DEC-094](./DECISIONS.md#dec-094--optional-google-and-apple-owner-sign-in-methods) and [OWNER_SIGN_IN_METHODS.md](./OWNER_SIGN_IN_METHODS.md):

- Owner may use CheckStation email + password, Google, and/or Apple on the same `accounts.User`.
- OAuth identity is `(provider, provider_subject)`; provider email is informational only.
- No automatic account merge by email; explicit connect from Account → Security after password login.
- At least one sign-in method must remain; password cannot be removed once set (V1).
- **Owner CheckStation 2FA applies after every first-factor login** (password, Google, Apple). OAuth callbacks call `complete_owner_authentication()`; they never call `establish_owner_session()` directly.
- V1: OAuth-only owners must set a CheckStation password before password-gated sensitive actions (`password_not_available`); no OAuth step-up re-auth on those endpoints.
- **Not** added to WorkspaceStaffAccount, workspace-ID staff login, or platform admin auth.
- Provider-link rows cascade-delete with the owner User on permanent account deletion.

## Paying customer email verification

- New paying customer registrations create an unverified User plus exactly one Organization.
- Workspace API access and owner login require `email_verified=True`.
- Verification and password-reset tokens expire after **24 hours**.
- Forgot-password always returns a neutral success message.
- Transactional auth email is sent via the configured provider (currently Resend) using environment variables. Do not hardcode API keys. **Production intent (DEC-088, not yet wired in application defaults):** verification, password-reset, and other account links use the workspace origin (`workspace.checkstation.app`); platform From is `RESEND_FROM_EMAIL` (`accounts@checkstation.app`).
- **Group attendance email** is a separate system from platform Resend. Each Group may configure its own outgoing sender (**Custom SMTP**, **Gmail App Password**, **Outlook / Microsoft 365** SMTP AUTH, or **Yahoo Mail** App Password). SMTP/App passwords are encrypted at rest with `APP_SECRETS_ENCRYPTION_KEY` (or a key derived from `SECRET_KEY` in local DEBUG). APIs never return decrypted passwords; logs and client errors must not include secrets. Only owner/admin workspace roles may change sender credentials (`CanManageWorkspace`). Switching providers clears the previous provider’s encrypted secret. Normal Google or Yahoo account passwords are never accepted; Gmail and Yahoo use App Passwords only. The Microsoft provider is primarily for Microsoft 365 business/work mailboxes with Authenticated SMTP enabled; personal Outlook/Hotmail compatibility is not guaranteed, and an app password does not restore disabled SMTP AUTH. Google/Microsoft/Yahoo OAuth are not implemented in this slice.
- **Public Contact** (`POST /api/contact/`) is unauthenticated. It is protected by Cloudflare Turnstile (server-side verification; production fails closed if keys are missing), a hidden honeypot, IP rate limiting, and a short duplicate window. Do not trust client-supplied workspace/user IDs on this endpoint. Contact mail uses the verified CheckStation From address (`RESEND_FROM_EMAIL`); Reply-To may be the submitter. Destination is `CONTACT_TO_EMAIL` (production intent `contact@checkstation.app`; DEC-088). `LEGAL_CONTACT_EMAIL` is a separate published-legal placeholder. Never store or publish the private forwarding mailbox. ContactRequest rows persist even if email send fails. Platform admin only. Optional Group **Forward Emails** are workspace-manager configuration only (not exposed on kiosk/public endpoints); copies are sent as separate deliveries so participants do not see forward recipients.
- **WorkspaceStaffAccount** is not part of this email-verification flow.
- **Platform operators** (`is_staff` / `is_superuser`) are exempt from the customer verification gate so Django admin / local platform management remains usable. Django `/admin/` access for those accounts requires mandatory TOTP after password authentication.

## Session isolation

- Django `/admin/` uses a separate session cookie and CSRF cookie from the Check Station web app.
- Platform-operator login at `/admin/` and customer owner / WorkspaceStaffAccount login in the app may exist in the same browser at the same time.
- Customer register / login / logout, and workspace-staff login / logout, must not replace or flush the platform-admin session. Logging out of `/admin/` must not end the customer/workspace session.
- Do not solve this in frontend state. Session cookies remain HttpOnly; CSRF protection remains enabled.

## Group kiosk session lock

- Starting a Group kiosk from the Check Station web app locks **that browser's Check Station app session**. Closing the kiosk tab does not unlock it.
- While locked, normal workspace pages and workspace APIs are denied for that session. The session may still load kiosk state, operate the active Group kiosk, exit with password reauthentication, or log out.
- Reopening Check Station in the same browser/session returns to the active kiosk. `/login` must not restore the workspace dashboard while the lock is set.
- Only the explicit Exit kiosk flow (current owner or workspace-staff password) clears the lock on the server. Wrong passwords leave the lock in place.
- The lock is stored on the Check Station app session (`kiosk_locked`, `kiosk_group_id`). It does **not** use the isolated Django `/admin/` session and does not automatically lock other browsers or devices for the same owner.
- This is an interim control for the current owner/staff browser kiosk. Dedicated kiosk device credentials remain open (OPEN-004).
- Participant Name/PIN fields are not website login credentials and must not be presented as account password fields.
- **Class PIN** (Structured Groups) follows the same low-security attendance-PIN philosophy as participation PIN: managers may view/change it; participant-facing kiosk APIs must never return Class PIN values; verify endpoints report only success/failure. Class PIN is not account authentication and must not be merged with participant PIN.

## Archive versus permanent deletion

- **Archive/deactivate** is reversible and preserves tenant data and history. It is the normal operational removal path.
- An archived **Member** cannot be edited and is operationally inactive in Group and kiosk flows. Restore returns the same Member and reactivates existing GroupMemberships. Permanent Member delete is allowed only after archive; Action Record snapshots remain, and the live Member link is cleared.
- **Organization Block** is not archive. It is a platform-enforced workspace access restriction (`Organization.status=blocked`). Owner/staff/kiosk/workspace APIs stop immediately. Data is kept. For a normal paid customer, blocking schedules period-end subscription cancellation (no current-period refund). CheckStation-managed workspaces change access only.
- **User.is_active** deactivates the owner login only. It does not automatically block staff or kiosk, and it does not cancel billing. Do not merge User deactivation with Organization Block.
- **Subscription cancellation** is not account deletion.
- **Permanent account deletion** is owner-only (paying `accounts.User`) or platform-superuser in Django admin. The customer path requires re-authentication (current password) and explicit confirmation. Workspace staff cannot delete the paying customer's account. Platform staff who are not superusers cannot permanently delete tenants. Platform-admin permanent User delete is refused while the User still owns an Organization. Organization permanent delete is refused while a live provider subscription exists. High-risk admin actions also require a fresh platform-admin password and a required reason (DEC-092). Platform TOTP still gates `/admin/`.
- After permanent deletion, the customer email may be registered again. Stale verification or password-reset tokens for the deleted User are invalid.
- Permanent deletion removes that tenant's workspace and customer-created operational data. Narrow legal/security retention may still apply per policy and is not implemented here.

---

## Public Status API

The independent Status service exposes **public read-only** JSON. It requires no workspace login, no Django CSRF, and no cookies.

Allowed: component ids and public names, states and labels, timestamps, short public descriptions, overall status, public incidents, scheduled maintenance.

Must **never** appear: stack traces, raw exceptions, database host or `DATABASE_URL`, API keys, Stripe or Resend raw errors, internal server names, workspace IDs, Member data, email addresses, customer SMTP configuration, or participant information.

CORS is uncredentialed (`Access-Control-Allow-Origin: *` on GET/OPTIONS) so future web, mobile, and desktop clients can read the same API. Do not enable credentialed CORS on this surface.

Django helper endpoints (`/api/health/`, `/api/health/kiosk/`, `/api/health/email/`, `/api/health/stripe/`) return only `{ "status": ... }`. Kiosk health must not lock sessions or create Action Records. Email health must not send mail. A sending-only Resend key that cannot call `GET /domains` is not an outage. Stripe health must not create customers, subscriptions, or payments.

---

## Public Content API (Docs / legal)

The Django Content API exposes **public read-only** published documents and published FAQ entries. It requires no workspace login, no Django CSRF, and no cookies.

Allowed for documents: slug, title, type, nav group, short description, Markdown body, version, updated/effective dates, sort order, canonical URL.

Allowed for FAQ: slug/id, question, Markdown answer, category, category label, keywords, related document slug, featured, sort order, updated timestamp.

Must **never** appear: `admin_notes`, drafts, unpublished documents or FAQ entries, internal review comments, file paths, stack traces, or credentials.

Clients (Docs website now; Workspace/mobile/desktop later) may cache responses (`Cache-Control: public, max-age=60, must-revalidate`) but must treat version and effective date from the API as authoritative. FAQ search may run on the client from one published list, or via `?q=` on `GET /api/content/faq/`; both use the same canonical rows. Editing a document or FAQ entry in Django admin updates all clients without a frontend release.

CORS for this API uses the existing Django CORS allowlist (include the Docs origin). Docs fetches are uncredentialed.

---

## Production origins (DEC-088)

Production separates public, workspace, Docs, and Status origins:

- `checkstation.app` — promotional site (including `/contact`)
- `workspace.checkstation.app` — owner/staff workspace and account/auth/billing flows
- `docs.checkstation.app` — documentation and legal
- `status.checkstation.app` — public Status page and Status API

The production API hostname is **not** frozen until reverse-proxy design (OPEN-029). Cookie, CORS, and CSRF policy for the split promotional vs workspace origins is a later implementation task. Do not treat current localhost single-SPA behavior as the production host map.

**Platform administration** uses a **dedicated private management origin**, not listed in public navigation, sitemap, or robots. The exact hostname is not advertised in public-facing product documentation. **Obscurity is not a security control.** Platform-admin authentication and mandatory TOTP remain required. Workspace Admin/Staff must never receive Django admin access.

**Indexing intent (not implemented here):** index marketing pages on `checkstation.app` and public Docs/legal on `docs.checkstation.app`. Generally do not index authenticated workspace app pages or the private management origin.

---

## Tenant Isolation

Strict Organization tenant isolation remains a non-negotiable security requirement. See [ARCHITECTURE.md](./ARCHITECTURE.md) and [DECISIONS.md](./DECISIONS.md) (DEC-003).

---

## Document Status

| Field | Value |
|-------|-------|
| **Status** | Security requirements plus paying-customer email verification, isolated admin sessions, permanent account deletion, mandatory platform-admin TOTP, Check Station app-session kiosk lock, encrypted Group email-sender credentials, customer workspace Admin authorization (DEC-070), public Status API, public Content API (published docs/legal only), public Contact API (Turnstile, honeypot, rate limit), and frozen production origin family (DEC-088) |
| **Last updated** | 2026-08-26 |
