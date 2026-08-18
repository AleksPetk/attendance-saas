# Decision Log

Architecture and product decisions for the Configurable Check-In / Attendance SaaS Platform.

**Status values:** `confirmed` | `provisional` | `superseded` | `open`

Only log decisions supported by approved product planning. Do not invent decisions.

---

## Confirmed Decisions

### DEC-001 — Multi-tenant SaaS platform

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Build a multi-tenant SaaS platform where independent Organizations configure their own check-in/attendance systems. |
| **Reason** | Product serves diverse customer types (schools, companies, gyms, events, etc.) as isolated tenants on shared infrastructure. |
| **Status** | confirmed |

### DEC-002 — Generic, industry-agnostic design

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Architecture and terminology remain generic. The product is not a single-industry attendance application. |
| **Reason** | Scalability across customer types; avoid baking in one organization's workflow as the default model. |
| **Status** | confirmed |

### DEC-003 — Strict tenant isolation

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Each Organization is an isolated tenant. Cross-tenant data access is forbidden across all entity types. |
| **Reason** | Fundamental security and trust requirement for SaaS handling organizational and participant data. |
| **Status** | confirmed |

### DEC-004 — User is distinct from Organization

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Platform User accounts are separate from Organizations. A User may belong to or manage multiple Organizations. |
| **Reason** | Supports consultants, multi-org administrators, and users who operate several independent tenants. |
| **Status** | confirmed |

### DEC-005 — Participants generally lack platform accounts

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Participants (students, employees, guests, event attendees, etc.) generally do not require platform User accounts. |
| **Reason** | Reduces friction for check-in workflows; participants interact via kiosks, reservation numbers, or other identification methods. |
| **Status** | confirmed |

### DEC-006 — Canonical Member model with Group Memberships

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Organizations create reusable canonical Member profiles. Members attach to Groups via Group Memberships with optional group-specific field overrides that do not modify canonical Member data. |
| **Reason** | Avoids duplicate person records while allowing context-specific data (e.g., different email per Group). |
| **Status** | confirmed |

### DEC-007 — Group-only participants supported

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Participants may be added directly to a Group without a full Organization Member profile. |
| **Reason** | Supports temporary or lightweight participation (e.g., summer class attendee) without forcing full Member creation. |
| **Status** | confirmed |

### DEC-008 — Standalone Events as core concept

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Event is a temporary or one-time check-in/attendance context belonging to an Organization. It can operate independently of persistent Members and Groups. An Event may contain Event Entries. Reservation-number check-in is one possible Event workflow, not the definition of Event itself. |
| **Reason** | Supports seminars, conferences, appointments, one-day activities, and other temporary check-in contexts as first-class workflows without requiring persistent Members or Groups. |
| **Status** | confirmed |

### DEC-009 — Separate terminology for Events vs historical records

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | **Event** = temporary/one-time real-world check-in context. **Action Record** = historical record created when an Action is performed. These terms must not be conflated. |
| **Reason** | Prevents product and implementation confusion between temporary check-in contexts and historical records of performed Actions. |
| **Status** | confirmed |

### DEC-010 — Every action creates a historical record

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Every performed Action must create an Action Record. The system must not store only current status. Action history must be preserved. Historical records must not be silently overwritten or manipulated in a way that destroys historical integrity. Manual correction behavior and audit mechanics will be designed separately. |
| **Reason** | Historical integrity, reporting, audit, and future corrections require a complete action history without silent loss of record integrity. |
| **Status** | confirmed |

### DEC-011 — Kiosks are participant-facing interfaces

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Kiosks are saved, configurable check-in interfaces separate from the admin dashboard. Kiosk Mode must never expose Organization administration. |
| **Reason** | Participants need simple, safe interfaces; admins need full management capabilities. These must not be conflated. |
| **Status** | confirmed |

### DEC-012 — Limited kiosk branding only

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Kiosk branding is limited to colors, optional logo, title, and basic theme choices. No arbitrary CSS or page-builder. |
| **Reason** | Platform controls structural UX for consistency, accessibility, and maintainability. |
| **Status** | confirmed |

### DEC-013 — Controlled admin UI structure

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Organization admin dashboard structure and navigation remain platform-controlled. Limited visual theming may come later. |
| **Reason** | Consistent documentation, support, accessibility, QA, and maintenance. |
| **Status** | confirmed |

### DEC-014 — MVP is not a workflow engine

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Configurable Actions are supported, but MVP must not become a general-purpose workflow engine with arbitrary conditional programming or unlimited automation. |
| **Reason** | Scope control, maintainability, and predictable product behavior for non-technical users. |
| **Status** | confirmed |

### DEC-015 — Design before implementation

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Important product behavior and major architecture are designed and approved before implementation. Implementation tools must not silently redefine product requirements. Developers and Cursor may use normal engineering judgment for implementation details and choose clean compatible solutions. Changes that would affect approved product behavior, tenant/security boundaries, major architecture, billing behavior, data ownership, or historical integrity must be surfaced for review rather than decided silently. |
| **Reason** | Prevents scope creep and contradictory implementations while preserving practical engineering freedom for compatible implementation choices. |
| **Status** | confirmed |

### DEC-016 — Development order: backend then web

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Implementation order: (1) design, (2) Django/DRF backend, (3) React web frontend, (4) polish backend + web, (5) mobile later, (6) native/desktop later. |
| **Reason** | Web product maturity before mobile; backend-first enables API contract stability. |
| **Status** | confirmed |

### DEC-017 — Technology stack direction

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Backend: Python/Django/DRF. Database: PostgreSQL. Web: React. Mobile (later): React Native/Expo. Deployment (later): Docker, Linux, Nginx, Gunicorn, Cloudflare. |
| **Reason** | Current architectural direction for the team stack. Not permission to implement until instructed. |
| **Status** | confirmed |

### DEC-018 — Recurring subscription SaaS model

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Product is sold as recurring subscription SaaS with plan-based limits. Web billing likely via Stripe (subject to later design). |
| **Reason** | Standard SaaS business model with natural usage-based limit enforcement. |
| **Status** | confirmed |

### DEC-019 — Storage quotas focus on media, not history

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Storage quotas primarily protect against uploaded media (photos, logos, assets), not attendance history rows. History retention is a separate design concern. |
| **Reason** | Attendance history is small relative to media; forcing history deletion for quota reasons would harm product value. |
| **Status** | confirmed |

### DEC-020 — Automatic image optimization for uploads

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Member photos and branding logos should be automatically optimized (resize, compress, strip metadata). Quotas count optimized stored assets, not original upload size. |
| **Reason** | Prevent storage abuse; avoid storing unnecessarily large phone camera images for small display use. |
| **Status** | confirmed |

### DEC-021 — Initial notification channel is transactional email

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Initial notification delivery is transactional email sent by the platform on behalf of Organizations. Customers should not need DNS configuration for basic use. Custom verified sending domains may be considered later and could belong to a higher subscription tier; exact plan placement is undecided. |
| **Reason** | Lowest friction onboarding; optional custom sending domains remain a future consideration without committing to plan placement. |
| **Status** | confirmed |

### DEC-022 — Distinguish configured kiosks from active sessions

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Subscription limits distinguish saved Kiosk definitions from simultaneously active kiosk/device sessions. |
| **Reason** | Organizations may configure many kiosks but only operate a limited number concurrently per plan. |
| **Status** | confirmed |

### DEC-023 — Event deletion requires warning and export option

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Before deleting an Event, warn that Event Entries and Event-specific data may be permanently deleted. Offer export/download. Do not auto-delete Events by age alone. |
| **Reason** | Protect customer data; encourage cleanup without silent data loss. |
| **Status** | confirmed |

### DEC-024 — No form-builder or page-builder in current scope

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Do not design a full arbitrary form-builder (configurable fields) or page-builder (kiosk/admin customization) during current planning stage. |
| **Reason** | Scope control; configurable fields will be designed with defined limits, not unlimited custom forms. |
| **Status** | confirmed |

---

## Open Decisions

Unresolved questions requiring explicit approval before implementation.

| ID | Topic | Notes |
|----|-------|-------|
| OPEN-002 | Action/state model | How actions relate to participant current state |
| OPEN-003 | Configurable field types and MVP scope | Which field types and how many per Group |
| OPEN-004 | Kiosk security and session model | Device credentials, session management, authentication |
| OPEN-005 | Permission and role model | Admin vs staff capabilities and granularity |
| OPEN-006 | Notification engine architecture | Templates, triggers, variables, delivery pipeline |
| OPEN-007 | Plan names, pricing, and exact limits | Basic/Pro/Business and all quota numbers |
| OPEN-008 | Free trial behavior | Duration (~7 days is direction only), feature access during trial |
| OPEN-009 | Historical record retention policy | Archival, deletion, and compliance requirements |
| OPEN-010 | Database schema and API design | Not yet designed; no tables approved |
| OPEN-011 | Stripe integration design | Checkout, webhooks, plan sync, billing portal |
| OPEN-012 | Image optimization specifications | Max dimensions, formats, thumbnail strategy |
| OPEN-013 | MVP feature final checklist | Which candidate features are in vs out |
| OPEN-014 | Group-only participant to Member linking | Conversion workflow and duplicate detection |
| OPEN-015 | App store billing for mobile | Apple/Google requirements research needed |
| OPEN-016 | Platform administration tooling scope | What platform operators need at launch vs later |
| OPEN-017 | Export formats for MVP | CSV confirmed as future need; which formats in MVP |
| OPEN-018 | Manual correction and audit workflow | How corrections interact with historical integrity |
| OPEN-019 | Event integration with Members/Groups | Advanced optional linking behavior |
| OPEN-020 | Kiosk identification methods for MVP | Which methods (PIN, name selection, reservation number, QR, etc.) |
| OPEN-021 | Minimum Member data | Which Organization-level Member fields, if any, are universally required. Do not assume email, phone, photo, member code, etc. are mandatory. |
| OPEN-022 | Event Entry future structure | Whether future architecture will split generic Event Entries into separate concepts such as Reservation → Attendees, and under what circumstances. |
| OPEN-023 | Action Record source/context | Whether every Action Record must include a Kiosk/device/session reference or whether Actions may also originate from admin/manual/API/other sources. Exact source/context model undecided. |
| OPEN-024 | Organization billing lifecycle | How Organization states (trial, subscribed, cancelled, suspended, other) relate to the Subscription model and access rules. Do not design the billing state machine yet. |

---

## How to Use This Log

1. Add new decisions with the next `DEC-###` ID when the project owner approves them.
2. Move resolved items from Open Decisions to Confirmed Decisions.
3. Mark superseded decisions with status `superseded` and reference the replacing decision.
4. Do not log speculative ideas as confirmed decisions.
