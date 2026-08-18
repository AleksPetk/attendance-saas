# Security Requirements

Security posture and requirements for the Configurable Check-In / Attendance SaaS Platform.

For confirmed decisions, see [DECISIONS.md](./DECISIONS.md). For product scope, see [MVP.md](./MVP.md).

This document records **security requirements and direction**. It does not define implementation details unless explicitly noted.

---

## Authentication and Account Types

### Customer User (`accounts.User` + OrganizationMembership)

- **Human login account** for people who authenticate to the SaaS application.
- Accesses **exactly one** Organization **workspace** through **OrganizationMembership** with an Organization role (**owner**, **admin**, or **staff**).
- Does **not** switch Organizations in one login. Separate businesses require separate User accounts.
- Distinct from Organization **Members** and other operational participant records, even when the same real-world person holds both a User login and a Member profile.
- Disabling or removing staff User access must **not** destroy that person’s Member attendance history.

### Platform operator User (`accounts.User` platform-admin flags)

- Uses the same `accounts.User` model as customer Users.
- Django `is_staff` / `is_superuser` are **global** platform-operator flags for the **Django admin site** and future platform-operator tooling.
- Remain **separate from customer Organization membership**. They are **not** Organization customer roles.

### Member / Participant

- Tracked people inside an Organization workspace. Generally **no** SaaS login required.
- Must not be conflated with User accounts.

### Local development admin

- The first local platform superuser must be created manually via Django management commands.
- Do not commit credentials or hardcode admin users in code, migrations, or fixtures.

---

## Two-Factor Authentication (2FA)

| Account type | Requirement | Status |
|--------------|-------------|--------|
| **Platform admin / staff** (Django admin and future platform-operator tooling) | **Mandatory before production** | Not implemented yet |
| **Customer User accounts** (Organization workspace access via the SaaS application) | **Optional**, but should be **prominently recommended** for account safety | Not implemented yet |

2FA is a confirmed security requirement direction, not an MVP implementation task at the current foundation stage.

---

## Tenant Isolation

Strict Organization tenant isolation remains a non-negotiable security requirement. See [ARCHITECTURE.md](./ARCHITECTURE.md) and [DECISIONS.md](./DECISIONS.md) (DEC-003).

---

## Document Status

| Field | Value |
|-------|-------|
| **Status** | Initial security requirements (foundation stage) |
| **Last updated** | 2026-08-18 |
