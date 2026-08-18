# Configurable Check-In / Attendance SaaS Platform

Repository: `attendance-saas`

A **multi-tenant SaaS platform** where independent Organizations configure their own check-in, attendance, presence, kiosk, and temporary Event workflows.

This is **not** a single-industry product. It is not a school attendance app, an employee time clock, a gym check-in tool, or a system designed around one company. Architecture and terminology stay generic so Organizations can model the workflows they actually use.

Possible customers include schools, companies, gyms, clubs, childcare and training organizations, temporary events, and other groups that need configurable check-in or attendance. Those are examples of use, not separate product editions.

## Project Status

**The project is in the product and architecture design stage.**

Foundation product documentation is in place. Backend implementation has **not** started. The React web frontend has **not** been started. Mobile and desktop applications come later, after the web product is mature.

There is currently **no implemented application**, API, or deployed demo in this repository.

## Core Product Concepts

Approved product concepts currently include:

- **Organizations** — isolated customer tenants (billing state is separate from tenant identity)
- **Users / admins** — platform accounts that can belong to more than one Organization
- **Members** — reusable Organization-level person profiles
- **Groups** — Organization-defined participation contexts
- **Group Memberships** — Member-to-Group attachments, including group-specific data overrides
- **Group-only Participants** — people added to a Group without a full Member profile
- **Events** — temporary or one-time check-in/attendance contexts that can operate without Members or Groups
- **Event Entries** — temporary records belonging to an Event
- **Actions** — configurable operations such as Check In, Check Out, or Arrived
- **Action Records** — historical records created when an Action is performed
- **Kiosks** — participant-facing check-in interfaces, separate from Organization administration
- **Notifications** — action-triggered messages (initial direction: transactional email)
- **Subscriptions / Plans** — recurring SaaS billing with plan-based limits (details not finalized)

Participants generally do not need platform User accounts.

## Planned Technology Direction

This is the **planned** stack. None of it is implemented in this repository yet.

| Layer | Direction |
|-------|-----------|
| Backend | Python, Django, Django REST Framework |
| Database | PostgreSQL |
| Web frontend | React |

Later stages, when explicitly in scope:

- Mobile: React Native / Expo
- Desktop: macOS and Windows applications
- Deployment: Docker, Linux, Nginx, Gunicorn, and Cloudflare where appropriate

Web billing is likely to use Stripe; that design is not finalized. Native app store billing requires separate research before implementation.

## Development Order

1. Product and architecture design ← **current stage**
2. Django / DRF backend
3. React web frontend
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
| [PRODUCT.md](./PRODUCT.md) | Detailed product definition |
| [MVP.md](./MVP.md) | MVP scope boundaries and feature categorization |
| [TERMINOLOGY.md](./TERMINOLOGY.md) | Canonical and provisional product terms |
| [DECISIONS.md](./DECISIONS.md) | Confirmed decisions and open questions |

Cursor project rules live in [`.cursor/rules/project.mdc`](./.cursor/rules/project.mdc).

## License

No open-source license has currently been assigned. This is a personal product-development repository, not an advertised open-source contribution project. Do not assume the contents are freely reusable.
