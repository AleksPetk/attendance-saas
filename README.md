# Configurable Check-In / Attendance SaaS Platform

Repository: `attendance-saas`

A **multi-tenant SaaS platform** where independent Organizations configure their own check-in, attendance, presence, kiosk, and temporary Event workflows.

This is **not** a single-industry product. It is not a school attendance app, an employee time clock, a gym check-in tool, or a system designed around one company. Architecture and terminology stay generic so Organizations can model the workflows they actually use.

Possible customers include schools, companies, gyms, clubs, childcare and training organizations, temporary events, and other groups that need configurable check-in or attendance. Those are examples of use, not separate product editions.

## Project Status

**Technical foundation is in progress.**

Product and architecture documentation is in place. A Django + DRF backend, React web frontend, PostgreSQL, and Docker Compose local stack are implemented at foundation level (health check, custom User model, Organization owner + WorkspaceStaffAccount, Members, Groups, GroupMemberships, and Group-only Participants). Event and Kiosk models are **not** yet implemented. Mobile and desktop applications come later.

## Core Product Concepts

Approved product concepts currently include:

- **Organizations** — internal tenant/workspace boundary (not a customer-facing business name); one paying User; system-generated immutable Workspace ID
- **Users** — platform-level logins (platform operators and the paying owner); one globally unique email; a paying User owns exactly one Organization
- **WorkspaceStaffAccounts** — customer-created admin/staff logins scoped to one Organization; username unique per workspace only; not Users
- **Members** — tracked people inside an Organization; they do not access the workspace
- **Groups** — long-lived reusable participation/check-in contexts (not just folders); each owns its kiosk configuration
- **Group Memberships** — Member-to-Group attachments, including group-specific data overrides
- **Group-only Participants** — people added to a Group without a full Member profile
- **Events** — temporary or one-time participation contexts; each owns its kiosk configuration; can operate without Members or Groups
- **Event Entries** — temporary records belonging to an Event (may exist without creating reusable Members; Action Records still remain)
- **Actions** — configurable operations such as Check In, Check Out, or Arrived
- **Action Records** — historical records created when an Action is performed
- **Kiosks** — participant-facing check-in interfaces owned by a Group or Event, not a global workspace resource
- **Notifications** — action-triggered messages (initial direction: transactional email)
- **Subscriptions / Plans** — recurring SaaS billing tied to Organization workspaces; V1 tiers **Basic / Plus / Business** with frozen USD prices (DEC-072, DEC-077); Event quota axes remain open; internal entitlement + billing domain before Stripe (DEC-076, DEC-081)

Participants (Members, Group-only participants, Event Entries) generally do not need User or WorkspaceStaffAccount logins. Platform operator admin accounts are separate from workspace owner/admin/staff.

## Planned Technology Direction

This is the **planned** stack. Foundation pieces are partially implemented locally via Docker Compose.

| Layer | Direction |
|-------|-----------|
| Backend | Python, Django, Django REST Framework |
| Database | PostgreSQL |
| Web frontend | React |

Later stages, when explicitly in scope:

- Mobile: React Native / Expo
- Desktop: macOS and Windows applications
- Deployment: Docker, Linux, Nginx, Gunicorn, and Cloudflare where appropriate

Web billing uses a Stripe provider boundary (Checkout redirect, webhooks, Customer Portal, upgrade preview). Live Stripe TEST credentials are not committed; supply them locally after creating a Stripe account. Native app store billing requires separate research before implementation; purchase-source persistence is frozen (`none` / `stripe` / `apple`).

## Development Order

1. Product and architecture design
2. Django / DRF backend ← **in progress (foundation)**
3. React web frontend ← **in progress (foundation)**
4. Complete, test, and polish backend + web
5. Mobile frontend later
6. macOS / Windows desktop applications later

## Engineering Principles

- **Strict multi-tenancy** — Organization A must never access Organization B’s data
- **Tenant isolation** as a security requirement, not an optional feature
- **Historical integrity** — every performed Action creates an Action Record; the product must not store only current state
- **Generic, multi-industry architecture** — never design around one school, company, gym, or event
- **Human-readable, maintainable code** once implementation begins
- **Design before implementation** — important product behavior and major architecture are approved before coding
- **MVP scope discipline** — confirmed, candidate, post-MVP, and undecided items stay distinct

## Documentation

Repository documentation is the source of truth for approved decisions.

| Document | Contents |
|----------|----------|
| [PROJECT.md](./PROJECT.md) | Short project overview, principles, and development order |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture source of truth |
| [PRODUCT.md](./PRODUCT.md) | Detailed product definition |
| [MVP.md](./MVP.md) | MVP scope boundaries and feature categorization |
| [TERMINOLOGY.md](./TERMINOLOGY.md) | Canonical and provisional product terms |
| [DECISIONS.md](./DECISIONS.md) | Confirmed decisions and open questions |
| [SECURITY.md](./SECURITY.md) | Security requirements and 2FA direction |

Cursor project rules live in [`.cursor/rules/project.mdc`](./.cursor/rules/project.mdc).

## License

No open-source license has currently been assigned. This is a personal product-development repository, not an advertised open-source contribution project. Do not assume the contents are freely reusable.
