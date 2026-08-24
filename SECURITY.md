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
| **Paying customer User accounts** (workspace owner login) | **Optional**, but should be **prominently recommended** for account safety | Not implemented yet |
| **WorkspaceStaffAccount** (customer-created admin/staff) | Undecided; not designed yet | Not implemented yet |

Platform-operator 2FA uses standard TOTP (Google Authenticator and other TOTP apps). After a correct admin password, the operator is held in a pending admin-session state until setup or a TOTP/recovery-code challenge succeeds. Existing authenticated admin sessions from before this slice may continue until logout; the next `/admin/` login must complete 2FA. Recovery codes are shown once and stored hashed. A successful recovery-code login grants a 10-minute admin-session recovery authorization that can replace a lost authenticator without the old TOTP; that authorization is not granted by an ordinary TOTP admin session. Replacing the authenticator immediately disables the old TOTP secret; old recovery codes are invalidated only after the new authenticator is verified. Break-glass CLI: `python manage.py reset_platform_2fa <email> --yes`. Customer owner login and WorkspaceStaffAccount login are unchanged and have no 2FA in this slice. TOTP secrets are encrypted at rest with `PLATFORM_2FA_ENCRYPTION_KEY`, or a key derived from `SECRET_KEY` in local DEBUG.

## Paying customer email verification

- New paying customer registrations create an unverified User plus exactly one Organization.
- Workspace API access and owner login require `email_verified=True`.
- Verification and password-reset tokens expire after **24 hours**.
- Forgot-password always returns a neutral success message.
- Transactional auth email is sent via the configured provider (currently Resend) using environment variables. Do not hardcode API keys.
- **Group attendance email** is a separate system from platform Resend. Each Group may configure its own outgoing sender (**Custom SMTP**, **Gmail App Password**, **Outlook / Microsoft 365** SMTP AUTH, or **Yahoo Mail** App Password). SMTP/App passwords are encrypted at rest with `APP_SECRETS_ENCRYPTION_KEY` (or a key derived from `SECRET_KEY` in local DEBUG). APIs never return decrypted passwords; logs and client errors must not include secrets. Only owner/admin workspace roles may change sender credentials (`CanManageWorkspace`). Switching providers clears the previous provider’s encrypted secret. Normal Google or Yahoo account passwords are never accepted; Gmail and Yahoo use App Passwords only. The Microsoft provider is primarily for Microsoft 365 business/work mailboxes with Authenticated SMTP enabled; personal Outlook/Hotmail compatibility is not guaranteed, and an app password does not restore disabled SMTP AUTH. Google/Microsoft/Yahoo OAuth are not implemented in this slice. Optional Group **Forward Emails** are workspace-manager configuration only (not exposed on kiosk/public endpoints); copies are sent as separate deliveries so participants do not see forward recipients.
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
- **Subscription cancellation** is not account deletion. Billing is not implemented in this slice.
- **Permanent account deletion** is owner-only (paying `accounts.User`) or platform-superuser in Django admin. It requires re-authentication (current password) and explicit confirmation on the customer path. Workspace staff cannot delete the paying customer's account. Platform staff who are not superusers cannot permanently delete tenants.
- After permanent deletion, the customer email may be registered again. Stale verification or password-reset tokens for the deleted User are invalid.
- Permanent deletion removes that tenant's workspace and customer-created operational data. Narrow legal/security retention may still apply per policy and is not implemented here.

---

## Tenant Isolation

Strict Organization tenant isolation remains a non-negotiable security requirement. See [ARCHITECTURE.md](./ARCHITECTURE.md) and [DECISIONS.md](./DECISIONS.md) (DEC-003).

---

## Document Status

| Field | Value |
|-------|-------|
| **Status** | Security requirements plus paying-customer email verification, isolated admin sessions, permanent account deletion, mandatory platform-admin TOTP, Check Station app-session kiosk lock, and encrypted Group email-sender credentials (Custom SMTP / Gmail App Password / Outlook Microsoft 365 SMTP / Yahoo Mail App Password) |
| **Last updated** | 2026-08-23 |
