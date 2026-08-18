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
| **Decision** | Platform User accounts are separate from Organizations. A User may belong to or manage multiple Organizations via OrganizationMembership. |
| **Reason** | Supports consultants, multi-org administrators, and users who operate several independent tenants. |
| **Status** | superseded |
| **Superseded by** | [DEC-033](#dec-033--one-customer-user-belongs-to-one-organization) |

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

### DEC-025 — OrganizationMembership entity

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | OrganizationMembership is an approved conceptual entity linking a customer User ↔ Organization. A customer User accesses and manages Organization data through OrganizationMembership. Operational customer data belongs to Organizations, not directly to Users. |
| **Reason** | Separates authenticated login accounts from tenant-scoped operational data and carries Organization role. Multi-Organization customer Users are no longer assumed; see DEC-033. |
| **Status** | confirmed |

### DEC-026 — MVP Organization role names

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Fixed MVP Organization role names on OrganizationMembership: **owner**, **admin**, **staff**. Exact capability and permission differences between roles remain undecided. |
| **Reason** | Establishes a stable role vocabulary for MVP authorization design without prematurely defining a full permission matrix. |
| **Status** | confirmed |

### DEC-027 — Tenant/person conceptual architecture foundation

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Approved conceptual architecture foundation: User, Organization, OrganizationMembership, Member, Group, GroupMembership, GroupOnlyParticipant. User ≠ Member. No generic Person model. Cross-Organization relationships forbidden. Tenant isolation enforced at application level and database level where practical. |
| **Reason** | Provides an implementation-ready tenant and person model before Django/API design. Documented in ARCHITECTURE.md. |
| **Status** | confirmed |

### DEC-028 — Custom Django User model (email-based)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Implement a project-owned custom Django `User` model in the `accounts` app before domain models. The model extends `AbstractUser`, uses **email** as `USERNAME_FIELD` (no username field), and represents global SaaS account holders/staff — not Organization Members or other operational participants. `AUTH_USER_MODEL = "accounts.User"`. |
| **Reason** | Establishes the authentication identity early while the project is still at initial migrations, avoiding a later swap away from Django’s default User. Keeps the model minimal and compatible with Django admin/auth while leaving room for future SaaS account fields and email-based login flows. |
| **Status** | confirmed |

### DEC-029 — Platform Django admin access is separate from Organization roles

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Django `is_staff` and `is_superuser` on `accounts.User` represent **platform operator / SaaS management** access to the Django admin site. They are **not** Organization customer roles. Organization roles (owner, admin, staff) will be modeled on OrganizationMembership. The first local platform superuser is created manually; no hardcoded admin credentials in the repository. |
| **Reason** | Prevents conflating platform-operator tooling access with tenant-scoped customer administration and keeps local admin setup explicit and secure. |
| **Status** | confirmed |

### DEC-030 — 2FA requirements for platform admin and customer Users

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | **Platform admin/staff 2FA is mandatory before production.** **Customer User 2FA is optional** but should be prominently recommended for account safety. 2FA is not implemented at the current foundation stage. |
| **Reason** | Platform operators have elevated access; customer Users benefit from optional hardening without blocking MVP onboarding friction. Documented in [SECURITY.md](./SECURITY.md). |
| **Status** | confirmed |

### DEC-031 — Email addresses stored in normalized lowercase form

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Platform User email addresses are normalized to lowercase (full address, not domain-only) before storage via the User manager and model `save()`. Combined with the unique email constraint, duplicate accounts differing only by email case are prevented. |
| **Reason** | Email is the authentication identifier; case-insensitive uniqueness avoids duplicate accounts and login confusion. |
| **Status** | confirmed |

### DEC-032 — Clarified workspace, User, and Member model

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | **Organization** is the customer workspace, tenant boundary, and subscription owner; real-world legal customer type is irrelevant to the platform model. **User** is a human login account accessing an Organization workspace via **OrganizationMembership**; each Organization has one primary **owner** User and may have additional staff Users with roles/permissions defined later. **Member** is a tracked person inside the Organization and generally does not need a login. The same real-world person may be both a staff User and a Member, but those remain **separate records and lifecycles** with **no required link**. Disabling staff User access must **not** destroy Member attendance history. **Subscriptions** belong to the Organization workspace, not to Members. Platform operator admin/staff access remains separate from Organization customer roles. Customer User ↔ Organization cardinality is defined in DEC-033. |
| **Reason** | Makes the distinction between login accounts, customer workspaces, and tracked participants explicit before Organization models are implemented. Preserves tenant isolation and historical integrity. |
| **Status** | confirmed |

### DEC-033 — One customer User belongs to one Organization

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | A **normal customer User may belong to only one Organization**. **OrganizationMembership** remains the relationship/role entity, with **at most one active customer Organization membership per User**. Customer Users do **not** switch Organizations in one login. If the same real person manages two separate customer businesses/workspaces, they use **separate User accounts**. Each Organization has **exactly one primary owner** User and may have additional admin/staff Users. Platform `is_staff` / `is_superuser` operator accounts remain global and separate from customer Organization membership. |
| **Reason** | Simplifies login, tenant context, billing, and permissions. Avoids org-switching UX and accidental cross-tenant access. Consultants/multi-business operators use separate accounts rather than one User spanning tenants. |
| **Status** | confirmed |
| **Supersedes** | DEC-004 (multi-Organization customer User assumption) |

---

## Open Decisions

Unresolved questions requiring explicit approval before implementation.

| ID | Topic | Notes |
|----|-------|-------|
| OPEN-002 | Action/state model | How actions relate to participant current state |
| OPEN-003 | Configurable field types and MVP scope | Which field types and how many per Group |
| OPEN-004 | Kiosk security and session model | Device credentials, session management, authentication |
| OPEN-005 | Organization role capability matrix | MVP role names owner/admin/staff approved on OrganizationMembership; exact capabilities and permission differences per role undecided |
| OPEN-006 | Notification engine architecture | Templates, triggers, variables, delivery pipeline |
| OPEN-007 | Plan names, pricing, and exact limits | Basic/Pro/Business and all quota numbers |
| OPEN-008 | Free trial behavior | Duration (~7 days is direction only), feature access during trial |
| OPEN-009 | Historical record retention policy | Archival, deletion, and compliance requirements |
| OPEN-010 | Database implementation and API design | Conceptual entities for the tenant/person foundation are approved in ARCHITECTURE.md. Django models, database tables, fields, indexes, constraints, migrations, REST/API design, and tenant-enforcement mechanisms (e.g. RLS) remain undecided |
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
| OPEN-025 | User ↔ Member explicit linking | Same real-world person may be both User and Member; any explicit link, deduplication, or conversion mechanism remains undecided. Do not invent a required link during foundation implementation. |
| OPEN-026 | Customer User email uniqueness vs separate Organization accounts | `accounts.User.email` is currently globally unique. DEC-033 requires separate User accounts when one real person manages two Organizations. That person cannot reuse the same email for both accounts unless email uniqueness is later relaxed (e.g. unique per Organization). Keep globally unique email unless explicitly approved otherwise. |

---

## How to Use This Log

1. Add new decisions with the next `DEC-###` ID when the project owner approves them.
2. Move resolved items from Open Decisions to Confirmed Decisions.
3. Mark superseded decisions with status `superseded` and reference the replacing decision.
4. Do not log speculative ideas as confirmed decisions.
