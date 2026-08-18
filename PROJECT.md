# Configurable Check-In / Attendance SaaS Platform

## What This Is

A **multi-tenant SaaS platform** where independent **Organizations** configure and operate their own check-in, check-out, attendance, presence, reservation check-in, and activity-tracking systems.

This is **not** a single-company attendance app, a school-only product, or a simple employee time clock. Architecture and terminology must remain **generic** so the platform serves schools, companies, gyms, clubs, childcare centers, events, and other organizations with configurable workflows.

## Technology Direction

Current architectural direction (not permission to implement until explicitly instructed):

| Layer | Direction |
|-------|-----------|
| Backend | Python, Django, Django REST Framework |
| Database | PostgreSQL |
| Web frontend | React |
| Mobile (later) | React Native / Expo |
| Deployment (later) | Docker, Linux, Nginx, Gunicorn, Cloudflare where appropriate |
| Billing (later) | Recurring SaaS subscriptions; web billing likely via Stripe |

Native/desktop applications (macOS, Windows) and mobile app store billing are **future considerations** requiring separate research and approval.

## Development Order

1. Product and architecture design ← current stage
2. Django / DRF backend
3. React web frontend
4. Complete, test, and polish backend + web
5. Mobile frontend later
6. macOS / Windows desktop applications later

Do not begin mobile or desktop work unless explicitly instructed.

## Source of Truth

Repository documentation is the **durable source of truth** for approved project decisions.

ChatGPT and project discussions are used to design, challenge, review, and approve decisions. Important approved decisions should then be recorded in the relevant repository files.

This file is the short project entry point. Detailed product definition, scope, terminology, and decisions live in the files listed below.

## Fundamental Principles

### Product

- **Freedom** — Organizations configure systems matching real workflows.
- **Simplicity** — Normal owners/staff should not need technical knowledge.
- **Power** — Advanced customers get meaningful configuration options.
- **Safety** — Tenant isolation, permissions, billing, history, and sensitive data handled professionally.
- **Scalability** — Never design around one particular customer type or industry.

### Implementation Judgment

Developers and Cursor may use normal engineering judgment for implementation details and may choose a cleaner compatible implementation when appropriate.

Do **not** silently change:

- approved product behavior
- tenant / security boundaries
- major architecture
- billing behavior
- data ownership
- historical integrity

If one of those would need to change, surface it for review rather than deciding it silently.

Do not invent unapproved product requirements. Distinguish confirmed decisions from candidate, post-MVP, and undecided items. Do not silently expand MVP scope.

### Code Readability

Future code should favor long-term human readability and maintainability.

- Prefer descriptive names over unclear abbreviations.
- Prefer clear control flow over clever or excessively compact code.
- Avoid excessively long lines; use normal readable formatting.
- Keep functions, classes, components, and modules focused on clear responsibilities.
- Avoid giant multi-purpose or multi-thousand-line files.
- When a file becomes difficult to understand, navigate, test, or maintain, or begins handling unrelated responsibilities, split it into meaningful modules.
- Do not impose arbitrary tiny file-size limits; split based on responsibility and maintainability.
- Use comments where they explain why something exists or clarify non-obvious behavior.
- Avoid comments that merely repeat obvious code.
- Reuse logic appropriately, but do not introduce abstractions merely for the sake of abstraction.
- Follow established project conventions once those conventions exist.

Do not add detailed Django, React, database, or API structure here until that architecture is designed and approved.

### Development Workflow

When implementation begins:

1. Inspect existing authoritative project files.
2. Plan the requested change.
3. Avoid unrelated changes.
4. Preserve tenant isolation.
5. Explain architecture-affecting assumptions.
6. Surface review-worthy changes instead of silently deciding them.
7. Update documentation when an approved decision changes.

## Authoritative Documentation

| File | Purpose |
|------|---------|
| [PRODUCT.md](./PRODUCT.md) | Detailed product definition |
| [MVP.md](./MVP.md) | MVP scope boundaries and feature categorization |
| [TERMINOLOGY.md](./TERMINOLOGY.md) | Canonical and provisional product terms |
| [DECISIONS.md](./DECISIONS.md) | Architecture and product decision log |

## Cursor Rules

Permanent AI guidance lives in [.cursor/rules/project.mdc](./.cursor/rules/project.mdc). Agents should read `PROJECT.md` and relevant docs at the start of substantial work.
