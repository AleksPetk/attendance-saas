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
| **Decision** | Event is a **temporary or one-time** check-in/attendance context belonging to an Organization. It can operate independently of persistent Members and Groups. An Event may contain Event Entries. An Event **owns its own kiosk configuration** (DEC-044). Reservation-number check-in is one possible Event workflow, not the definition of Event itself. |
| **Reason** | Supports seminars, conferences, appointments, one-day activities, and other temporary check-in contexts as first-class workflows without requiring persistent Members or Groups. |
| **Status** | confirmed |
| **Clarified by** | [DEC-044](#dec-044--group-and-event-own-kiosk-configuration), [DEC-045](#dec-045--group-and-event-lifecycle-and-mixed-workspace) |

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
| **Clarified by** | [DEC-072](#dec-072--v1-plan-tiers-basic-plus-business) (V1 plan names/limits), [DEC-076](#dec-076--internal-entitlement-layer-before-stripe) (entitlement before Stripe), [DEC-077](#dec-077--v1-paid-usd-pricing-and-billing-intervals)–[DEC-081](#dec-081--internal-billing-domain-and-purchase-sources) |

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
| **Decision** | Initial notification delivery is transactional email sent by the platform on behalf of Organizations. Default delivery must work without customer DNS. Custom verified sending domains may be considered later; implementation and plan placement are undecided (see also DEC-042). |
| **Reason** | Lowest friction onboarding; optional custom sending domains remain a future consideration without committing to plan placement. |
| **Status** | confirmed |

### DEC-022 — Distinguish configured kiosks from active sessions

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Subscription limits should distinguish **configuration** from **simultaneously active kiosk/device sessions**. Do not treat concurrent sessions as the same axis as “how many kiosks exist.” |
| **Reason** | An Organization may have several Group/Event kiosk configurations while only operating a limited number of devices at once. |
| **Status** | confirmed |
| **Clarified by** | [DEC-044](#dec-044--group-and-event-own-kiosk-configuration) — kiosk configuration is owned by Group/Event, not an independent workspace-level definition list. **V1 Group/Member/staff/feature limits frozen (DEC-072)**; **USD prices frozen (DEC-077)**; Event axes remain OPEN-007. |

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
| **Status** | superseded |
| **Superseded by** | [DEC-047](#dec-047--paying-user-owns-workspace-staff-are-workspace-scoped-accounts) |

### DEC-026 — MVP Organization role names

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Workspace access role names remain **owner**, **admin**, and **staff**. **owner** is the paying customer User on Organization. **admin** and **staff** are WorkspaceStaffAccount roles. Exact capability differences remain undecided. |
| **Reason** | Establishes a stable role vocabulary without a full permission matrix. |
| **Status** | confirmed |
| **Clarified by** | [DEC-047](#dec-047--paying-user-owns-workspace-staff-are-workspace-scoped-accounts) |

### DEC-027 — Tenant/person conceptual architecture foundation

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Approved conceptual architecture foundation: User (platform operators and paying owner), Organization with one-to-one owner, WorkspaceStaffAccount, Member, Group, GroupMembership, GroupOnlyParticipant. User ≠ Member. No generic Person model. Cross-Organization relationships forbidden. Tenant isolation enforced at application level and database level where practical. |
| **Reason** | Provides an implementation-ready tenant and person model before Django/API design. Documented in ARCHITECTURE.md. |
| **Status** | confirmed |
| **Clarified by** | [DEC-047](#dec-047--paying-user-owns-workspace-staff-are-workspace-scoped-accounts) |

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
| **Decision** | Django `is_staff` and `is_superuser` on `accounts.User` represent **platform operator / SaaS management** access to the Django admin site. They are **not** Organization customer roles. Workspace **owner** is the paying User; **admin**/**staff** are WorkspaceStaffAccount. The first local platform superuser is created manually; no hardcoded admin credentials in the repository. |
| **Reason** | Prevents conflating platform-operator tooling access with tenant-scoped customer administration and keeps local admin setup explicit and secure. |
| **Status** | confirmed |

### DEC-030 — 2FA requirements for platform admin and customer Users

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | **Platform admin/staff 2FA is mandatory before production.** **Customer User 2FA is optional** but should be prominently recommended for account safety. Platform-operator TOTP is implemented for Django `/admin/` (`is_staff` / `is_superuser` only). Customer owner 2FA and WorkspaceStaffAccount 2FA are not implemented in this slice. |
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
| **Decision** | **Organization** is the customer workspace, tenant boundary, and subscription owner. **User** is a platform-level login: platform operators and the **paying customer owner**. Each Organization has exactly one owner User. Customer-created admin/staff are **WorkspaceStaffAccount**, not Users. **Member** is a tracked person and generally does not need a login. The same real-world person may later be both a WorkspaceStaffAccount and a Member, with **no required link**. Disabling a staff account must **not** destroy Member attendance history. **Subscriptions** belong to the Organization. Platform operator flags remain separate from workspace roles. |
| **Reason** | Makes the distinction between paying accounts, workspace staff logins, and tracked participants explicit. |
| **Status** | confirmed |
| **Clarified by** | [DEC-047](#dec-047--paying-user-owns-workspace-staff-are-workspace-scoped-accounts) |

### DEC-033 — One customer User belongs to one Organization

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | A **paying customer User owns exactly one Organization**. That User is the workspace **owner**. Customer Users do **not** switch Organizations in one login. If the same real person operates two separate workspaces, they use **separate paying User accounts**. Additional workspace admin/staff are WorkspaceStaffAccount rows, not Users. Platform `is_staff` / `is_superuser` operator accounts remain global and are not workspace roles. |
| **Reason** | Simplifies login, tenant context, billing, and permissions. Avoids treating every teacher/staff login as a global SaaS User. |
| **Status** | confirmed |
| **Supersedes** | DEC-004 (multi-Organization customer User assumption) |
| **Clarified by** | [DEC-045](#dec-045--group-and-event-lifecycle-and-mixed-workspace), [DEC-047](#dec-047--paying-user-owns-workspace-staff-are-workspace-scoped-accounts) |

### DEC-034 — Public website then Organization workspace

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | The public browser website includes promotional/SEO pages, homepage, product explanation, pricing, registration/login, sitemap, and `robots.txt`. After registration and authentication, the customer accesses their **Organization workspace**. The public site, workspace, and Kiosk Mode are distinct surfaces. |
| **Reason** | Makes the customer journey explicit before further domain modeling: marketing/acquisition is public; operations happen in the tenant workspace. |
| **Status** | confirmed |

### DEC-035 — Workspace may begin trial or unsubscribed

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | An Organization workspace is the **subscription boundary**. It may begin unsubscribed (currently **Basic** at registration) or later enter a Business trial / paid subscription. Organization identity exists independently of currently paying. |
| **Reason** | Onboarding should not require a paid subscription before a workspace exists. Billing implementation stays a separate design. |
| **Status** | confirmed |
| **Clarified by** | [DEC-078](#dec-078--business-trial-commercial-rules) (trial access and conversion rules; duration still TBD), [DEC-081](#dec-081--internal-billing-domain-and-purchase-sources). Current registration creates Basic and does **not** auto-start a trial. |

### DEC-036 — Controlled workspace UI; constrained kiosk branding

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Organization workspace UI uses the platform **design system and prepared themes**. Customers may choose **controlled appearance options** but cannot arbitrarily redesign the dashboard. Kiosks may allow **more customer-facing branding** (logo, selected colors, prepared presentation options) still within controlled choices — not arbitrary CSS or a page-builder. |
| **Reason** | Consistent support, accessibility, and QA for the workspace; enough kiosk presentation flexibility for real-world devices without a page-builder. |
| **Status** | confirmed |

### DEC-037 — Members do not access the workspace

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | **Members** are tracked people and **do not access** the Organization workspace. Workspace access is for the paying **owner** User and for **WorkspaceStaffAccount** admin/staff. Participant check-in happens through Kiosks and similar participant-facing interfaces. |
| **Reason** | Prevents conflating tracked participation with SaaS administration. |
| **Status** | confirmed |

### DEC-038 — Groups define participation and check-in behavior

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | A **Group is not just a folder**. It is a **long-lived, reusable** participation/check-in context for its Members (and Group-only Participants). Different Groups may use different **predefined identification methods** (examples: PIN only, Member ID + PIN, Member ID only, visible member selection) and different **predefined Actions** (examples: Check In, Check Out, Break Start, Break End). Identification methods and Actions are building blocks, not a generic workflow engine. Each Group **owns its kiosk configuration** (DEC-044). Which methods/Actions ship in MVP remains open. |
| **Reason** | One Organization often needs different operational patterns (classroom vs warehouse vs staff clock) without industry-specific product modes. |
| **Status** | confirmed |
| **Clarified by** | [DEC-044](#dec-044--group-and-event-own-kiosk-configuration), [DEC-045](#dec-045--group-and-event-lifecycle-and-mixed-workspace) |

### DEC-039 — Repeated Actions and simple presets

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Repeated Actions must be possible (for example multiple Break Start / Break End cycles). Simple **preset/automatic** attendance behavior may exist (for example automatic 08:00 Check In with the Member only recording Check Out). Preset implementation and the Action/state model remain undesigned. |
| **Reason** | Real attendance workflows include multiple breaks and some clock-in defaults; this must not imply a general-purpose automation engine. |
| **Status** | confirmed |

### DEC-040 — Action Record source and configuration-change integrity

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Action history must preserve **how** records were created. Confirmed product-level sources include **kiosk**, **staff/admin**, and **automatic/preset**. History must remain historically accurate when later Group, Kiosk, or Action **configuration** changes. Exact source/context fields, storage, and audit/correction mechanics remain undesigned. |
| **Reason** | Reports and disputes require knowing whether a check-in was kiosk-entered, staff-entered, or automatic, even after the Organization later changes kiosk or Group settings. |
| **Status** | confirmed |

### DEC-041 — Kiosks serve selected Groups and/or Events

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Kiosks are configurable **browser** interfaces that may serve **selected Groups and/or Events** with different flows. Example flows include visible-name selection, secure PIN with no names shown, Member ID + PIN, and reservation-number entry. These examples are not a confirmed MVP feature list. Kiosk security/session design remains open. |
| **Reason** | One saved kiosk definition can back different operational contexts without exposing the Organization workspace. |
| **Status** | superseded |
| **Superseded by** | [DEC-044](#dec-044--group-and-event-own-kiosk-configuration) |

### DEC-042 — Predefined post-Action outcomes and platform email

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | After an Action, configured outcomes may include **success message only**, **email/notification** to relevant recipients, or other **predefined** notification behavior. Default platform email delivery must work **without customer DNS**. Future custom/verified sending-domain configuration may allow customers to verify their own email domain; that implementation is not designed and plan placement is undecided. |
| **Reason** | Common check-in outcomes stay selectable building blocks. Lowest-friction email onboarding; custom domains stay a later capability. |
| **Status** | clarified |
| **Clarified by** | [DEC-059](#dec-059--group-custom-smtp-email-sender) |

### DEC-043 — One User account, one globally unique normalized email

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Each **User** account has **one globally unique email**, stored in **normalized lowercase** form (see also DEC-031). A real person who manages two Organizations uses two User accounts and therefore **two different emails**. Do not relax global uniqueness unless a later decision explicitly supersedes this. |
| **Reason** | Email is the authentication identifier. Global uniqueness avoids duplicate logins and accidental cross-account confusion. DEC-033 already requires separate User accounts per Organization workspace. |
| **Status** | confirmed |
| **Closes** | OPEN-026 |

### DEC-044 — Group and Event own kiosk configuration

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Each **Group** owns its own kiosk configuration. Each **Event** owns its own kiosk configuration. Kiosk configuration is **not** a global Organization-workspace resource attached to, or switched between, arbitrary Groups and Events. Different Groups and Events in the same workspace may have completely different kiosk presentation and behavior. For the simple initial product direction, each Group and each Event has **one** owned kiosk configuration. Multiple kiosk variants per Group or Event are a **future decision**, not an MVP requirement. Kiosk Mode remains a participant-facing surface that must never expose the Organization workspace (DEC-011). Kiosk database fields, launch flow, session/security, and whether configuration is stored as a separate entity or as fields on Group/Event remain undesigned. |
| **Reason** | A students Group, a staff Group, a training Group, and a reservation Event cannot share one workspace-level kiosk without losing per-context flexibility. Ownership by the participation context prevents a global kiosk multiplexer. |
| **Status** | confirmed |
| **Supersedes** | DEC-041 |
| **Clarifies** | DEC-022 |

### DEC-045 — Group and Event lifecycle and mixed workspace

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | **Group** and **Event** are similar as participation/check-in contexts (identification, Actions, owned kiosk configuration, outcomes) but have different **lifecycles**: Group is **long-lived and reusable**; Event is **temporary or one-time**. Do not collapse them into one entity. One paying customer User owns **one** Organization workspace and may use that workspace for **any mix** of real-world activities (businesses, schools, hobbies, teams, one-time Events) as Groups and Events. Separate User accounts remain required only when the same person operates **separate Organization workspaces** (DEC-033), not for each activity inside one workspace. Event Entries may represent temporary people **without** creating reusable Members; **Action Records** for those people still remain. Event deletion remains a warned, export-offered action (DEC-023). Plan limits may treat persistent Groups and Events differently; **V1 Group/Member/staff/feature limits are frozen (DEC-072)**; **Event-specific plan axes remain open (OPEN-007)**. |
| **Reason** | Customers should not need multiple tenants to run different activities. Groups and Events share a participation-context role but differ in persistence and likely billing/limit treatment. |
| **Status** | confirmed |
| **Clarifies** | DEC-008, DEC-033 |

### DEC-046 — Participant data requirements are contextual

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Do **not** make email, phone, photo, PIN, member code, reservation code, or similar fields globally mandatory on all Members. If a Group or Event workflow requires a field, that requirement is validated **for that participation context**. Organization-level required Member data is settled by DEC-053: **Name** is required; other profile fields remain optional. |
| **Reason** | A reservation Event may need only a reservation number; a staff Group may need ID + PIN; a students Group may need visible name/photo. A single mandatory Member schema would block those workflows. |
| **Status** | confirmed |
| **Clarifies** | OPEN-021 |
| **Clarified by** | [DEC-053](#dec-053--member-is-a-reusable-person-profile) |

### DEC-047 — Paying User owns workspace staff are workspace-scoped accounts

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | `accounts.User` is only for platform-level accounts: platform superuser, our SaaS staff, and the **paying customer**. Each paying User owns **exactly one** Organization (`Organization.owner` one-to-one). That User is the workspace **owner**. Customer-created workspace admin/staff are **WorkspaceStaffAccount** rows scoped to exactly one Organization. They are **not** Users, cannot exist globally, and cannot move between workspaces. Staff roles are **admin** or **staff** only. Staff login identity (username, optional email) is unique **per Organization** and is a separate identity space from global User email. Member remains unlinked. Deactivating a staff account must not affect Members or future attendance history. Django `is_staff` / `is_superuser` remain platform-operator flags only. OrganizationMembership as a global User ↔ Organization admin/staff link is **retired**. |
| **Reason** | The previous membership slice incorrectly treated customer-created workspace operators as global SaaS Users. Paying identity, workspace staff access, and tracked Members are different concerns. |
| **Status** | confirmed |
| **Supersedes** | DEC-025 |
| **Clarifies** | DEC-026, DEC-027, DEC-029, DEC-032, DEC-033, DEC-037 |
| **Clarified by** | [DEC-049](#dec-049--workspace-id-and-per-workspace-staff-usernames) |

### DEC-048 — Workspace staff login uses globally unique username

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Workspace staff log in with **username + password only**. The system resolves the Organization from the `WorkspaceStaffAccount`. Login must **not** require or display an Organization ID, tenant ID, workspace ID, or organization selector. To make that lookup unambiguous, **staff username is globally unique** and must **not** match a platform User email. Optional staff email uniqueness remains per Organization. Paying owners continue to log in with global User email + password. Staff remain `WorkspaceStaffAccount`, not `accounts.User`. |
| **Reason** | Per-organization usernames required a tenant identifier at login, which is unacceptable product UX. Global username uniqueness is the simplest safe tradeoff for credential-only staff login. |
| **Status** | superseded |
| **Clarifies** | DEC-047 |
| **Superseded by** | [DEC-049](#dec-049--workspace-id-and-per-workspace-staff-usernames) |

### DEC-049 — Workspace ID and per-workspace staff usernames

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Every Organization receives a system-generated, globally unique, immutable **Workspace ID** at creation. Staff/admin login is **Workspace ID + username + password**. Username uniqueness is **per workspace only**; the same username may exist in other workspaces. The paying owner logs in with global User email + password and does **not** use Workspace ID. Organization is an internal tenant model, not a required customer-facing display name. Do not use the numeric Organization primary key as the staff login identifier. Do not make staff usernames globally unique. |
| **Reason** | Staff accounts must stay workspace-scoped, including login identity. A human-enterable Workspace ID lets staff identify the isolated workspace without becoming global Users or using internal database keys. |
| **Status** | confirmed |
| **Supersedes** | DEC-048 |
| **Clarifies** | DEC-047 |

### DEC-050 — Paying customer email verification and auth mail

| Field | Value |
|-------|-------|
| **Date** | 2026-08-18 |
| **Decision** | Newly registered paying customer Users must verify email before workspace access. Verification uses Django HMAC tokens (not stored raw) that expire after **24 hours** and become invalid after successful verification, email change, or password change. Password reset uses Django’s `PasswordResetTokenGenerator` with **24-hour** expiry (`PASSWORD_RESET_TIMEOUT`). Forgot-password responses are enumeration-safe. Transactional auth email is sent through an isolated provider adapter; Resend is the current provider, configured by environment (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_BASE_URL`). WorkspaceStaffAccount logins are **not** part of this customer email-verification flow. Platform operators (`is_staff` / `is_superuser`) are exempt from the customer verification gate so Django admin remains usable. Platform admin 2FA remains **required before production** and is **not** implemented in this slice (DEC-030). |
| **Reason** | Confirms email ownership for paying accounts without changing tenant architecture, staff login, or starting the 2FA slice. |
| **Status** | confirmed |
| **Clarifies** | DEC-028, DEC-029, DEC-030, DEC-047 |

### DEC-051 — Platform admin session is isolated from customer/workspace session

| Field | Value |
|-------|-------|
| **Date** | 2026-08-19 |
| **Decision** | Django `/admin/` authentication is a separate browser session/cookie domain from Check Station customer owner and WorkspaceStaffAccount authentication. The same browser may hold both at once. Logging in, registering, or logging out of the customer/workspace app must not replace or flush the platform-admin session, and logging out of `/admin/` must not end the customer/workspace session. Owner and WorkspaceStaffAccount continue to share the Check Station application session. Platform operators remain separate identities from customer/workspace logins. CSRF remains enabled; each session domain has its own CSRF cookie. |
| **Reason** | Sharing one `sessionid` caused `/admin/` and the SPA to overwrite each other. Platform-admin access is a different security domain from paying-customer and workspace-staff access. |
| **Status** | confirmed |
| **Clarifies** | DEC-029 |

### DEC-052 — Archive, subscription cancellation, and permanent account deletion

| Field | Value |
|-------|-------|
| **Date** | 2026-08-19 |
| **Decision** | **Archive/deactivate** remains the reversible operational path and preserves workspace data and history. **Subscription cancellation** is not account deletion; future billing may disable or limit service while keeping data for a recovery period (billing is not implemented here). **Permanent customer account deletion** is a deliberate, irreversible owner-only (or platform-superuser) action that removes the paying User, Organization/workspace, and tenant-owned operational data for that workspace. After true deletion, the customer email may be registered again as a fresh account. Unverified accounts that are permanently deleted also release the email, and their verification/password-reset tokens cannot resurrect the old User. True deletion may still allow narrowly required legal or security/compliance retention per policy; that retention system is not implemented in this slice. Historical-integrity rules continue to apply to archive/deactivate; they do not block confirmed permanent account deletion for that tenant. |
| **Reason** | Privacy and account-deletion requirements, plus local testing that must reuse customer emails, need a real destruction path without weakening normal archive safety. |
| **Status** | confirmed |
| **Clarifies** | DEC-010, DEC-029, DEC-043, DEC-047 |

### DEC-053 — Member is a reusable person profile

| Field | Value |
|-------|-------|
| **Date** | 2026-08-20 |
| **Decision** | A **Member** is a reusable person profile inside a workspace, not a kiosk login or security object. Confirmed profile fields: **Name** (required, not unique), plus optional **email**, **date of birth**, **phone**, **address** (free-text), **photo**, and **notes**. Duplicate names are allowed. The Django primary key is the internal Member ID; do not build a customer-facing `MBR-XXXXXX` or other custom Member ID system. Member-level PIN and Member identifier / check-in identifier are **not** Member profile fields. Until Group/Kiosk participation identification is redesigned, existing Member `pin_hash` and `check_in_identifier` columns may remain as deprecated compatibility fallbacks for GroupMembership and kiosk checks. New Member create/edit UI and Member APIs must not collect those fields. |
| **Reason** | Separates the person profile from Group/Kiosk identification so later Group cleanup can own PIN and identifier behavior without treating Members as login objects. |
| **Status** | confirmed |
| **Clarifies** | DEC-006, DEC-046, OPEN-021 |

### DEC-054 — Member archive, restore, and permanent delete

| Field | Value |
|-------|-------|
| **Date** | 2026-08-20 |
| **Decision** | The Django Member primary key is the visible Member ID (`#1`, `#2` …): automatic, immutable, not a kiosk identifier. **Archive** is the normal removal path; archived Members cannot be opened or edited, and they are **operationally inactive**: they must not appear in Group participant lists, kiosk member lists, kiosk identify/perform, or automatic attendance, even if their GroupMembership row remains. **Restore** reactivates the same Member ID, profile, and existing GroupMemberships without creating new memberships. **Permanent delete** is allowed only after archive. Permanent delete removes the Member and related GroupMembership rows, deletes Member media best-effort, and leaves ActionRecord snapshot fields readable by setting `ActionRecord.member` to null (`SET_NULL`). Active Members cannot be permanently deleted directly. |
| **Reason** | Archive must be a real lifecycle state, not a label on an otherwise editable profile. History must survive Member deletion without inventing a second ID system. |
| **Status** | confirmed |
| **Clarifies** | DEC-052, DEC-053 |

### DEC-055 — Group product cleanup

| Field | Value |
|-------|-------|
| **Date** | 2026-08-20 |
| **Decision** | A **Group** is a reusable participation/activity configuration. Group basic settings are name, check-in, check-out, breaks, maximum breaks (1–3 when enabled), relevant after-action behavior, and Advanced (outgoing email sender; see DEC-059). Group basic settings are **not** Member-profile requirements. Every Group automatically has kiosk capability; there is no customer-facing `kiosk_enabled` setting. **Archive** retains configuration, memberships, and kiosk design but makes the Group operationally inactive. **Restore** reactivates the same Group PK. **Permanent delete** is archive-only, removes GroupMemberships and Group-only participants for that Group, deletes KioskDesign/media and Group email sender credentials, and preserves ActionRecord snapshots (`ActionRecord.group` SET_NULL, `group_name_snapshot`). Deprecated Group `require_*` columns may remain temporarily for kiosk identification compatibility until the next Kiosk cleanup. Automatic check-in is removed from the customer product. |
| **Reason** | Separates Group product configuration from Member profile requirements and from the upcoming Kiosk identification redesign while preserving history and kiosk runtime compatibility. |
| **Status** | confirmed |
| **Clarifies** | DEC-038, DEC-044, DEC-046, DEC-053, DEC-054 |

### DEC-056 — Group participation setup slice

| Field | Value |
|-------|-------|
| **Date** | 2026-08-20 |
| **Decision** | Every Group shows a visible immutable **Group #ID** from the Django Group PK. Every operational Group participation record (GroupMembership or Group-only participant) gets an immutable **Group participant code** (`G{group_id}-{4-digit suffix}`). Group participation **email** and **PIN** are stored on the participation record, separate from reusable Member profile fields. Member profile email may prefill Group participation email on add but never sync back on edit. Group participation PIN is a low-security attendance check-in code stored reversibly (plaintext field) so workspace managers can view assigned PINs; it is hidden from participant-facing kiosk list payloads. Group `require_email` / `require_pin` are the participation requirement toggles. **Setup incomplete** is a derived active state when requirements are ON but operational participants lack data; Group configuration save is allowed. While incomplete, real kiosk launch/start/identify/perform and automatic attendance are blocked; Kiosk Builder (design edit) remains available. Disabling a requirement does not delete stored participation values. |
| **Reason** | Separates Group participation setup from Member profile requirements and kiosk identification redesign while giving workspace users stable IDs/codes and clear readiness gating. |
| **Status** | confirmed |
| **Clarifies** | DEC-055 |

### DEC-057 — Dedicated Kiosk Settings behavioral layer

| Field | Value |
|-------|-------|
| **Date** | 2026-08-20 |
| **Decision** | Each Group has a `KioskSettings` record (OneToOne) separate from `KioskDesign`. Kiosk Settings owns identification mode (Card/Input), card display fields, input field count/second field, and a hashed per-Group kiosk exit code. Group `require_email` / `require_pin` define participation availability only; kiosk settings choose whether/how the kiosk uses them. **Group participant code** is the canonical kiosk identifier. Launch requires valid Group setup + valid Kiosk Settings + configured exit code; Kiosk Builder remains available while invalid. There is no separate Preview route — Builder canvas + Minimize is the design inspection path. Kiosk exit uses the Group exit code, not owner account password. |
| **Reason** | Clean separation between Group participation, kiosk behavior, and visual design; eliminates ambiguous name-only input identification. |
| **Status** | confirmed |
| **Clarifies** | DEC-055, DEC-056 |

### DEC-060 — Kiosk confirmation screen in Kiosk Settings

| Field | Value |
|-------|-------|
| **Date** | 2026-08-22 |
| **Decision** | Post-action confirmation belongs to **Kiosk Settings**, not Kiosk Builder. Fixed preset templates (`clean`, `business`, `friendly`, `kids`, `fitness`, `event`, `celebration`, `minimal`); editable per-enabled-action messages with safe `{name}`, `{time}` (24-hour), `{group}` variables; return delay fixed to 1, 3, or 5 seconds (default 3). Confirmation inherits kiosk Main background with its own readable surface/overlay. Legacy Group `kiosk_success_message` / `kiosk_confirmation_message` / `kiosk_return_delay_seconds` migrated to `KioskSettings` and are no longer runtime source of truth. |
| **Reason** | Intentional touch-friendly success UX without turning confirmation into a free-form design editor; single canonical behavioral configuration. |
| **Status** | confirmed |
| **Clarifies** | DEC-057 |

### DEC-058 — Always-on Header / Main / Footer shell

| Field | Value |
|-------|-------|
| **Date** | 2026-08-20 |
| **Decision** | Every Group kiosk always renders Header, Main, and Footer. There are no Header/Footer on/off settings. Section heights are automatic/responsive (Header `clamp(72px, 13vh, 130px)`, Footer `clamp(48px, 8vh, 82px)`, Main fills remaining). Header content (title/logo) and Footer content (one-line text + independent image) are optional. Customers who want an unobtrusive Header/Footer match backgrounds and leave content empty — sections never collapse. Legacy `config.header.enabled` / `config.footer.enabled` are normalized to `true` and ignored for rendering. Footer text is at most one line; Footer image is a separate `KioskDesign.footer_logo` field from Header logo. |
| **Reason** | Stable Main vertical layout for Card/Input UI; simpler product model without structural sync between Settings and Design. |
| **Status** | confirmed |
| **Clarifies** | DEC-057 |

### DEC-059 — Group Custom SMTP email sender

| Field | Value |
|-------|-------|
| **Date** | 2026-08-21 |
| **Decision** | Group **Advanced** owns outgoing email sender configuration for that Group. Automatic check-in is removed from the customer-facing Group product. Phase 1 provider is **Custom SMTP** only (Gmail/Microsoft/Yahoo provider flows later). Each Group may have one `GroupEmailSender`. SMTP passwords are encrypted at rest and never returned by API. **Draft credentials are tested before they become active:** a successful **Send test email** on the draft unlocks **Save sender**, which persists and marks **Ready**. Failed draft tests do not replace an existing Ready sender. After-action email toggles require Ready. Enabling any after-action email automatically sets Group `require_email=true` (with UI notice); disabling all after-action emails does **not** auto-disable require email. After-action messages send through the Group sender to Group participation email, not platform Resend and not Member profile email as the canonical recipient. Attendance ActionRecords persist even when email delivery fails; delivery attempts are audited without secrets. Platform Resend remains only for Check Station account emails. |
| **Reason** | Separates platform auth mail from customer attendance mail, makes sender readiness explicit, protects working senders from unverified drafts, and keeps attendance history independent of SMTP reliability. |
| **Status** | confirmed |
| **Clarifies** | DEC-021, DEC-042, DEC-055, DEC-056 |
| **Clarified by** | [DEC-060](#dec-060--group-gmail-app-password-email-sender), [DEC-061](#dec-061--group-outlook--microsoft-365-smtp-email-sender), [DEC-062](#dec-062--group-yahoo-mail-app-password-email-sender), [DEC-068](#dec-068--group-forward-emails) |

### DEC-060 — Group Gmail App Password email sender

| Field | Value |
|-------|-------|
| **Date** | 2026-08-21 |
| **Decision** | **Gmail** is Group email sender provider #2. First Gmail integration uses **Google App Passwords** (not normal Google account passwords, not OAuth). UI collects Gmail address, App Password, and optional From name only; technical SMTP host/port/security are applied internally (`smtp.gmail.com`, SSL/TLS on port 465). Sender email equals the connected Gmail address (no free From alias in this version). App Passwords are encrypted at rest in the shared `GroupEmailSender` secret field and never returned by API. Spaces in pasted App Passwords are stripped before storage/auth. Provider switch clears the previous provider’s encrypted secret and obsolete transport fields. Custom SMTP remains fully available. Google OAuth is not implemented. |
| **Reason** | Gives a guided Gmail path without exposing SMTP details, while reusing the existing sender readiness, test-email, after-action, and audit model. |
| **Status** | confirmed |
| **Clarifies** | DEC-059 |
| **Clarified by** | [DEC-061](#dec-061--group-outlook--microsoft-365-smtp-email-sender), [DEC-062](#dec-062--group-yahoo-mail-app-password-email-sender) |

### DEC-061 — Group Outlook / Microsoft 365 SMTP email sender

| Field | Value |
|-------|-------|
| **Date** | 2026-08-21 |
| **Decision** | **Outlook / Microsoft 365** is Group email sender provider #3 (`provider=microsoft`). First Microsoft integration uses **SMTP AUTH** only (not Microsoft OAuth, not Graph API). UI collects Microsoft email, password/app password, and optional From name; technical transport is STARTTLS port **587** on **`smtp.office365.com`** (Microsoft 365 / custom domains) or **`smtp-mail.outlook.com`** (known consumer Outlook/Hotmail/Live domains). Sender email equals the connected mailbox. Secrets use the shared encrypted field. Provider switch clears the previous secret. **Audience clarity:** this path is primarily for Microsoft 365 business/work mailboxes where an administrator can enable Authenticated SMTP; personal Outlook/Hotmail compatibility is not guaranteed, and an app password does not overcome disabled SMTP AUTH. Safe errors distinguish auth failure from SMTP AUTH disabled where recognizable. Custom SMTP and Gmail remain available. Microsoft OAuth is not implemented. |
| **Reason** | Adds a guided Microsoft SMTP path for tenants that still allow Authenticated SMTP, while making personal-account limitations explicit before credentials are entered. |
| **Status** | confirmed |
| **Clarifies** | DEC-059, DEC-060 |
| **Clarified by** | [DEC-062](#dec-062--group-yahoo-mail-app-password-email-sender) |

### DEC-062 — Group Yahoo Mail App Password email sender

| Field | Value |
|-------|-------|
| **Date** | 2026-08-21 |
| **Decision** | **Yahoo Mail** is Group email sender provider #4 (`provider=yahoo`). Integration uses **Yahoo App Passwords** only (not the normal Yahoo account password, not Yahoo OAuth). UI collects Yahoo email, App Password, and optional From name; technical SMTP is applied internally (`smtp.mail.yahoo.com`, SSL/TLS port **465**). Email validation is generic (not hardcoded to `@yahoo.com`). Spaces in pasted App Passwords are stripped. Secrets use the shared encrypted field and are never returned by API. Provider switch clears the previous secret. After-action delivery remains provider-independent once the sender is Ready. **MVP provider list is complete:** (1) Custom SMTP, (2) Gmail, (3) Outlook / Microsoft 365, (4) Yahoo Mail. No additional dedicated provider integrations are planned for the current MVP. |
| **Reason** | Completes the guided consumer/mailbox provider set with Yahoo’s documented SMTP + App Password path, reusing shared transport, readiness, test-email, and audit behavior. |
| **Status** | confirmed |
| **Clarifies** | DEC-059, DEC-060, DEC-061 |

### DEC-063 — History Activity Log and Attendance Report

| Field | Value |
|-------|-------|
| **Date** | 2026-08-21 |
| **Decision** | Workspace **History** has two views: **Activity Log** (existing raw Action Records) and **Attendance Report** (aggregated). Attendance Report requires selecting **one** Group (active, archived, or permanently deleted). Date filters: Today, This week, This month, or Custom range. Grain is **participant × local calendar day** for Standard Groups; Structured Groups use **participant × historical Class × local calendar day** so the same person under two Classes on one day stays two rows. Columns are derived from ActionRecord action types present in the selected range (not current Group settings): first check-in; break_start times joined when multiple; last check-out when multiple. `break_end` is not a report column. Structured reports expose `group_type=structured` and a leading **Class** identity column from ActionRecord Class snapshots; Standard reports never show Class. `ActionRecord.source_group_id` is an immutable Group PK snapshot that survives permanent Group deletion so deleted Groups remain selectable. Report API responses include group name/status/type, date range, columns, and rows. Exports (**PDF**, **Excel/.xlsx**, **CSV**) are generated from the same `build_attendance_report()` payload (not a second calculation). Hours/late/percentage analytics remain out of scope. |
| **Reason** | Organizations need historically accurate attendance views after Group config changes and after archive/delete, without inventing analytics or rewriting Action Records. |
| **Status** | confirmed |
| **Clarifies** | DEC-010, DEC-040, DEC-055 |

### DEC-064 — Kiosk Attendance Reset

| Field | Value |
|-------|-------|
| **Date** | 2026-08-22 |
| **Decision** | Each Group's **Kiosk Settings** include **Attendance Reset**: **Daily** (Group-wide local-time boundary; default 00:00; presets 00:00, 12:00, custom 24-hour time) or **Rolling** (participant-specific window from cycle-start check-in; presets 8h, 12h, custom hours+minutes up to 7 days). **Reset now** persists `manual_reset_at` for an immediate Group-wide fresh cycle without changing scheduled settings or deleting Action Records. Live kiosk state ignores Action Records before the effective boundary; History and Attendance Report remain unchanged. Timezone source: `get_report_timezone()` (project/workspace TZ until Organization timezone exists). |
| **Reason** | Participants need predictable fresh cycles without mutating historical attendance data or overloading Group action configuration. |
| **Status** | confirmed |
| **Clarifies** | DEC-057, DEC-039, DEC-010 |

### DEC-065 — Standard and Structured Group types

| Field | Value |
|-------|-------|
| **Date** | 2026-08-23 |
| **Decision** | Groups have an immutable **`group_type`**: **`standard`** (existing behavior; participants belong directly to the Group) or **`structured`** (participants belong to **Classes** inside the Group). Backend entity for Class is **`GroupSection`** (generic; product label is Class). Existing Groups migrate/default to `standard`. Structured Groups store **`require_class_pin`** (default OFF). Participation (`GroupMembership` / `GroupOnlyParticipant`) gains an optional `section` FK: null for Standard; required for Structured. Group participant codes remain Group-scoped and stable if a participant later moves between Classes. Class names are unique among active Classes in the same Group. Classes support archive → restore / permanent delete. ActionRecords remain Group-scoped. Structured kiosk actions store Class historical identity on ActionRecord (`section` SET_NULL, immutable `source_section_id`, `class_name_snapshot`, plus `group_type_snapshot`) so Attendance Report can show Class at action time without following later moves/renames/deletes. Structured live kiosk is defined in DEC-066; Standard kiosk remains unchanged. |
| **Reason** | Schools and similar orgs need Class hierarchy without breaking Standard Groups or forcing premature kiosk redesign. |
| **Status** | confirmed |
| **Clarifies** | DEC-055, DEC-056 |

### DEC-066 — Structured Group kiosk flow

| Field | Value |
|-------|-------|
| **Date** | 2026-08-23 |
| **Decision** | Structured Group live kiosk is **Card-only** (no Input mode). Flow: **Class → (optional Class PIN) → Participant → (optional participant PIN) → Action → Confirmation → return to Class selection**. Class PIN is optional via parent Group **`require_class_pin`**; when ON, each **active** Class must have its own Class PIN stored on `GroupSection` (low-security attendance PIN philosophy; managers may view/edit; never serialized to participant-facing kiosk payloads). Turning `require_class_pin` OFF does not erase stored Class PINs. Empty active Classes are hidden from live Class cards; launch requires ≥1 Class with operational participants. Participant lists are scoped to the selected Class (lazy-loaded). Card code label in Structured UI: **Class Participant Code** (backend code remains Group-scoped). Participant PIN remains separate Group participation PIN behavior. Actions/reset/confirmation reuse Standard attendance semantics; after confirmation timeout Structured returns to Class list. Same Kiosk Builder/design system; Standard Card/Input kiosk unchanged. |
| **Reason** | Structured participation is Class-first; next participant may belong to another Class, so confirmation must not return only to one Class’s participant list. |
| **Status** | confirmed |
| **Clarifies** | DEC-065, DEC-057, DEC-058 |

### DEC-067 — Standard Group → Class snapshot import

| Field | Value |
|-------|-------|
| **Date** | 2026-08-23 |
| **Decision** | Structured Groups may create a Class by **one-time snapshot import** from an **active Standard Group** in the same Organization (`POST …/classes/import-standard-group/`). Source picker lists active Standard Groups only (not Structured, not cross-tenant, not archived). Class name defaults to the source Group name and may be edited. Import copies current **operational** participants only: reusable Members become **new** destination `GroupMembership` rows (same Member FK; new participation email/PIN snapshot; new destination participant codes); Visitors become **new** `GroupOnlyParticipant` rows. Never copy kiosk settings/design, confirmation, Attendance Reset, exit code, email sender, actions, or ActionRecords. No ongoing sync or source pointer. Destination Group requirements/readiness apply after import. If a Member already participates in the destination Structured Group (`unique_member_per_group`), that Member is **skipped** with an explicit import message; Visitors are not deduplicated by name. Import is transactional for Class + copied rows. |
| **Reason** | Schools often seed Classes from existing flat Groups without wanting live linkage or kiosk/config cloning. |
| **Status** | confirmed |
| **Clarifies** | DEC-065 |

### DEC-068 — Group Forward Emails

| Field | Value |
|-------|-------|
| **Date** | 2026-08-24 |
| **Decision** | Groups may configure up to **3** optional **Forward Emails** under Advanced. These are Group configuration recipients (not Email Sender credentials). When after-action email runs for an enabled action, all configured participation emails remain `recipient_kind=participant`; each configured forward address also receives the **same** message (same sender/provider/From/subject/body) as a **separate** delivery so addresses stay private. Duplicates (including overlap with participation addresses) are normalized to a unique recipient set. Forwarding does not bypass Require email, does not allow forward-only sends without a participation email, does not invalidate sender Ready state, and applies to Standard and Structured Groups at the parent Group (not per Class). Each delivery is audited on `GroupEmailDelivery` with `recipient_kind` (`participant` \| `forward` \| `test`). Forwarding failures never roll back ActionRecords. |
| **Reason** | Lets offices/teachers receive attendance copies without exposing recipients to parents/participants or changing provider setup. |
| **Status** | confirmed |
| **Clarifies** | DEC-059 |
| **Clarified by** | [DEC-069](#dec-069--multiple-participation-emails) |

### DEC-069 — Multiple participation emails

| Field | Value |
|-------|-------|
| **Date** | 2026-08-24 |
| **Decision** | Each Group/Class participation (`GroupMembership` / `GroupOnlyParticipant`) may store up to **3** notification emails in canonical JSON `participation_emails`. Legacy scalars (`participation_email` / visitor `email`) mirror the first address for compatibility. Member profile email remains separate and may prefill participation email #1 on add only; edits never write back to Member profile. When Group Require email is ON, at least one participation email is required. After-action delivery sends the same message to all configured participation emails plus Group Forward Emails, as separate private deliveries with global dedupe. All participation deliveries use `recipient_kind=participant`. Standard Group → Class snapshot import copies the full participation email list. Applies equally inside Structured Classes; parent Group Require email remains authoritative. |
| **Reason** | Guardians (mother/father/other) often need the same attendance notification without sharing a mailbox or exposing addresses to each other. |
| **Status** | confirmed |
| **Clarifies** | DEC-053, DEC-059, DEC-068 |

### DEC-070 — Workspace Admin customer-workspace permissions

| Field | Value |
|-------|-------|
| **Date** | 2026-08-24 |
| **Decision** | Customer workspace roles are **Owner** (paying `accounts.User`), **Admin**, and **Staff** (`WorkspaceStaffAccount.role`). **Workspace Admin** may perform almost all operational workspace management: Members, Groups (Standard and Structured when plan permits), participation data, Group configuration, email sender/forward emails, kiosks, Activity Log, Attendance Report exports, and **Staff** account management (create/edit/deactivate/reactivate/reset password for `role=staff` only). **Owner-only:** billing/subscription, Owner account/security (login email, backup email, password, 2FA, recovery), creating or managing other **Admin** accounts (including role promotion/demotion), ownership transfer, permanent account/workspace deletion, and platform Django admin. Workspace Admin is **not** Django `is_staff` / `is_superuser`. Authorization is enforced server-side via centralized helpers in `organizations.permissions` (`CanManageWorkspace`, `CanManageStaffAccounts`, `IsWorkspaceOwner`, capability flags on current-workspace responses). Role permission does **not** override plan entitlements. **Workspace Staff** final capability matrix remains undecided (OPEN-005). |
| **Reason** | Trusted workspace managers need full day-to-day control without SaaS ownership, billing, or admin-role escalation. |
| **Status** | confirmed |
| **Clarifies** | OPEN-005 (partial — Admin frozen; Staff TBD) |

### DEC-071 — Workspace Staff Group-scoped permissions

| Field | Value |
|-------|-------|
| **Date** | 2026-08-24 |
| **Decision** | **Workspace Staff** (`WorkspaceStaffAccount.role=staff`) is **Group-scoped**, not a global workspace operator. Staff may be assigned zero or more Groups via `WorkspaceStaffGroupAccess` (Owner/Admin manage assignments for Staff only). Within assigned Groups, Staff may perform participant operations, launch/exit kiosk, and view/export History/Attendance Reports for those Groups only. Staff cannot: access unassigned Groups, use global Members directory/profile management, configure Groups/Kiosks/email sender, manage Staff/Admin, billing, or Owner account security. Owner/Admin retain workspace-wide operational access. Admin demoted → Staff clears Group assignments (Owner must reassign). Staff promoted → Admin preserves dormant assignments. Archived assigned Groups remain in access/history; permanently deleted Groups drop from live access but historical ActionRecords follow existing report scoping. |
| **Reason** | Operational staff need narrow Group access without workspace-wide configuration or Member management. |
| **Status** | confirmed |
| **Clarifies** | OPEN-005 (Staff matrix frozen) |

### DEC-072 — V1 plan tiers: Basic, Plus, Business

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | Canonical V1 plan names are **Basic**, **Plus**, and **Business** only (not Free / Pro / Enterprise). Full capability and quota matrix is frozen in [PRODUCT.md — Subscriptions and Plans](./PRODUCT.md#subscriptions-and-plans). Summary: **Basic** is free forever with ads, tight Standard-only quotas, Staff page locked (0 Admin / 0 Staff), full Kiosk Builder with **all** Card/Input kiosk templates, full Settings/History/Reports, no CSV/Excel/PDF export, Group email senders + after-action/participation emails allowed, Forward Emails locked. **Plus** is paid, no ads, larger Standard-only quotas, 2 Admin / 5 Staff, full Kiosk Builder with all templates, full exports, full Group email including Forward Emails, Staff Group assignments, Structured Groups still locked. **Business** is paid, no ads, includes Plus plus Structured Groups (active Structured quotas, Classes/participants per Class), larger Standard/Member/staff quotas, Standard → Structured Class snapshot import, and the full current product feature set for those capabilities. Kiosk template access does **not** differ by plan. Event-specific plan axes remain open. |
| **Reason** | Product, marketing, entitlement, and future billing must share one frozen V1 tier definition. |
| **Status** | confirmed |
| **Clarifies** | DEC-018, OPEN-007 (names and V1 Group/Member/staff/feature limits) |
| **Clarified by** | [DEC-077](#dec-077--v1-paid-usd-pricing-and-billing-intervals) (permanent USD prices) |
| **Product source** | [PRODUCT.md](./PRODUCT.md#subscriptions-and-plans) |

### DEC-073 — Plan entitlement semantics and non-destructive downgrade

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | Active and archived limits are separate where listed; archived resources do not consume active limits. Plan restrictions are enforced **server-side**, not UI-only. Role authorization and plan entitlement are **separate** checks; when both apply the actor must pass **both** (example: Workspace Admin may have role permission to create Structured Groups, but Plus does not entitle Structured Groups → deny). **Downgrading never automatically deletes customer data.** If usage exceeds the destination plan after downgrade: existing data remains; records stay readable/operational where safe; creation/reactivation/configuration that would increase over-limit usage is blocked; UI shows over-limit state; customer may reduce usage or upgrade. Do not silently archive or delete to force compliance. |
| **Reason** | Protects customers from data loss while keeping entitlement enforceable and distinct from RBAC. |
| **Status** | confirmed |
| **Clarifies** | DEC-070, DEC-072 |
| **Clarified by** | [DEC-079](#dec-079--immediate-upgrades-scheduled-downgrades-and-cancellations) (locks run only when the effective plan actually changes) |

### DEC-074 — Basic ads policy

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Updated** | 2026-08-25 |
| **Decision** | **Basic** may show ads in these frozen **web** placements: **Dashboard banner**, **Groups banner**, **before kiosk launch** (interstitial), **after kiosk exit** (interstitial), and **when leaving Kiosk Builder** (interstitial). Ads are **not** allowed during **live participant kiosk operation**. **Plus** and **Business** have **no ads**. A platform-operator global kill switch can hide all advertising without changing workspace plans. Local/web development uses a mock provider; a real provider is deferred until deployment. Ad/provider failure must never block application functionality. |
| **Reason** | Monetize Basic without interrupting participant check-in UX. |
| **Status** | confirmed |
| **Clarifies** | DEC-072 |

### DEC-075 — Owner Account area: Security, Subscription, Billing

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | Owner Account UI architecture uses three top-level sections/pages: **Security** (primary/login email, backup email, password, optional Owner TOTP 2FA, Danger Zone / permanent deletion), **Subscription** (current plan, status, limits/usage, upgrade/downgrade/cancellation, renewal, purchase-source-aware management), and **Billing** (payment summary + Stripe Customer Portal for invoices/payment method when Stripe-managed; no invented invoice store). Subscription ownership may come from different **purchase sources** (`none`, Stripe/web, Apple/app). Account UI respects purchase source (Apple-managed subscriptions do not show Stripe portal/change actions). Owner Account Subscription/Billing UIs are wired to owner billing APIs (Phase 2). |
| **Reason** | Separates identity/security from commercial subscription and payment surfaces before billing implementation. |
| **Status** | confirmed |
| **Clarifies** | DEC-052, OPEN-024 (Account IA; commercial lifecycle rules frozen in DEC-077–080) |

### DEC-076 — Internal entitlement layer before Stripe

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | Next billing-related implementation stage is an **internal entitlement / usage system** that answers: workspace plan; enabled features; per-resource limits; current usage; whether an operation may proceed; whether the workspace is over limit. Plan checks must not be scattered through Stripe-specific code. Stripe (and other purchase sources) later update subscription state that **feeds** this entitlement system. Stripe checkout/webhooks/portal remain undesigned (OPEN-011). |
| **Reason** | Keeps product entitlement portable across purchase sources and implementable before any payment provider. |
| **Status** | confirmed |
| **Clarifies** | DEC-018, DEC-072, DEC-073, OPEN-011 |
| **Followed by** | [DEC-081](#dec-081--internal-billing-domain-and-purchase-sources) (commercial billing state that feeds this layer) |

### DEC-077 — V1 paid USD pricing and billing intervals

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | Permanent V1 paid prices are **USD only**: Plus **$9.99/month** and **$99.90/year**; Business **$14.99/month** and **$149.90/year**. Yearly = **10 × monthly** (effectively two months free). Basic remains free. Both **monthly** and **yearly** are V1 launch intervals for paid plans. The application does not invent proration arithmetic; the payment provider calculates amounts. Interval-change execution (monthly ↔ yearly) is deferred to provider integration. |
| **Reason** | Marketing, catalog, and future Stripe Price objects must share one frozen list price. |
| **Status** | confirmed |
| **Clarifies** | DEC-018, DEC-072, OPEN-007 (prices; Event axes remain open) |

### DEC-078 — Business trial commercial rules

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | V1 trial, when started, provides **Business** access. A payment method/card is required **before** the trial starts. If the customer does nothing, the trial automatically continues into **paid Business**. The customer may cancel immediately after starting; cancellation does **not** remove Business access until **trial end**. If canceled correctly before trial end, it must **not** convert to paid Business, then the workspace becomes **Basic**. **Exact trial duration is not frozen** (TBD / later configurable). Architecture stores explicit trial start/end. Registration does **not** auto-start a trial (workspaces still default to Basic until checkout exists). |
| **Reason** | Card-required trial reduces unpaid abuse while still letting customers evaluate Business. Duration can be tuned without changing conversion rules. |
| **Status** | confirmed |
| **Clarifies** | DEC-035, OPEN-008 (behavior frozen; duration still open) |

### DEC-079 — Immediate upgrades; scheduled downgrades and cancellations

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | **Paid upgrades are immediate** (Plus → Business, including yearly → yearly). Unused paid value is credited and the remaining prorated difference is charged **by the provider**; the billing-cycle anchor is preserved where supported. Do not charge a full new Business year on top of already-paid Plus time. Subscription UI should later show a provider-calculated immediate charge before confirm (Phase 2; do not fabricate preview amounts). **Paid downgrades are scheduled** for current paid period end (Business → Plus): current plan stays fully available; **no plan locks at request time**; at period end, `Organization.plan` changes and existing plan-lock behavior runs. **Cancellation** is scheduled for paid period end or trial end: access remains until then; then paid/trial access ends and the workspace becomes **Basic**. Cancellation is not account/data deletion (DEC-052). |
| **Reason** | Customers keep paid value they already bought; entitlement locks only when the effective plan actually changes. |
| **Status** | confirmed |
| **Clarifies** | DEC-052, DEC-073, OPEN-024 |

### DEC-083 — Reverse scheduled cancellation and downgrade before effective date
| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | While a Stripe-managed cancellation is still pending (`cancel_at_period_end`) and access has not ended, the Owner may **resume** the subscription: Stripe clears cancel-at-period-end on the **existing** subscription; internal pending Basic transition is cleared; `Organization.plan` is unchanged; billing cycle / renewal date is preserved; no new Checkout and no immediate resubscribe charge. The same resume applies to a canceled Business trial still within the trial window (trial end unchanged; auto-conversion to paid Business is restored). While a Business→Plus downgrade is scheduled and not yet effective, the Owner may **cancel the downgrade**: Stripe releases the schedule; Business price/subscription continues; pending Plus is cleared; cycle preserved; no Checkout/charge. Reversals require successful provider confirmation before local pending state is cleared. Apple-managed sources do not use these Stripe actions. |
| **Reason** | Owners need a way to reverse a change of mind before period end without recreating billing. |
| **Status** | confirmed |
| **Clarifies** | DEC-079, OPEN-024 |

### DEC-084 — Scheduled billing interval and combined plan+interval changes

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Decision** | **Billing interval changes are always scheduled for the current paid period end** (monthly↔yearly). No immediate charge and no proration for interval-only changes. **Combined tier+interval changes** (e.g. Plus monthly → Business yearly) are scheduled entirely for period end—no immediate tier upgrade or proration preview. Same-interval tier upgrades (Plus→Business on the same interval) remain **immediate** with provider-calculated proration (DEC-079). Scheduled interval/combined changes may be **canceled before the effective date** via Stripe schedule release, reusing the existing reversal pattern (DEC-083). Interval-only changes do not change `Organization.plan` until effective; combined changes apply the target plan at effective date through `apply_effective_plan()`. |
| **Reason** | Keeps interval switches predictable, avoids double-charging, and preserves the existing billing-cycle anchor. |
| **Status** | confirmed |
| **Clarifies** | DEC-077, DEC-079, DEC-083, OPEN-011 |

### DEC-080 — Payment-failure grace

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | The first failed recurring payment does **not** immediately downgrade. Current paid entitlement is preserved for a **3-day** grace. A warning email is intended **once per day** during grace (existing platform email later; not sent in this phase). If payment recovers, failure/grace state is cleared. If billing remains unresolved after the final provider outcome/grace handling, paid access ends and the workspace transitions to **Basic**. The app does **not** implement an independent payment retry engine; Stripe retry/webhooks coordinate with this internal grace state in Phase 2. |
| **Reason** | Short recovery window without instantly collapsing a paid workspace. |
| **Status** | confirmed |
| **Clarifies** | OPEN-024 |

### DEC-081 — Internal billing domain and purchase sources

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | Commercial subscription state lives in a dedicated **billing** domain, one current `WorkspaceSubscription` per Organization. `Organization.plan` remains the entitlement plan; `organizations.entitlements` remains the capability system. Billing **feeds** entitlement only through the canonical `apply_effective_plan()` transition (which preserves plan-lock sync). Purchase sources are **`none`**, **`stripe`**, and **`apple`**. Basic/free workspaces have no paid purchase source. Platform-admin plan edits are manual entitlement operations (no charges) and use the same effective transition path. Stripe Checkout, webhooks, Customer Portal, and Apple IAP are not implemented in this decision. |
| **Reason** | Keeps provider objects out of the entitlement catalog and gives Stripe/Apple one safe plan-mutation entry point. |
| **Status** | confirmed |
| **Clarifies** | DEC-076, DEC-075, OPEN-011 (internal state; provider integration still open) |

### DEC-082 — Launch promotion separate from permanent pricing

| Field | Value |
|-------|-------|
| **Date** | 2026-08-25 |
| **Decision** | A public-launch discount is planned **separately** from the frozen permanent catalog. Current direction only: approximately **30–50%** off, approximately **1–2 weeks**, at **actual public product launch** (after intended app/platform releases are ready — not merely the first server deployment). Exact percentage and campaign dates are **not** frozen. Launch discounts must not change permanent catalog plan definitions; they will be implemented through the billing provider/promotion mechanism later. |
| **Reason** | Launch marketing must not rewrite the durable price list. |
| **Status** | confirmed |
| **Clarifies** | DEC-077 |
| **Clarified by** | [DEC-090](#dec-090--eligibility-based-promotion-groups) (eligibility groups; Group 1 keeps OFF/NORMAL/BIG percents for New/Basic only) |

### DEC-089 — Global Promotion Modes

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Decision** | CheckStation has exactly **three** platform-wide promotion modes: **`off`**, **`normal_discount`**, **`big_discount`**. The mode is a single global setting (not per user, workspace, plan, or customer) controlled only by platform admin. **Commercial rules:** OFF = normal list prices. NORMAL_DISCOUNT = **50%** off the **first monthly** payment and **30%** off the **first yearly** payment, then normal recurring price. BIG_DISCOUNT = **70%** off the **first monthly** payment and **50%** off the **first yearly** payment, then normal recurring price. Eligible paid plans are **Plus** and **Business**; **Basic** stays free with no promotion calculation. Permanent `billing.catalog` list prices are never mutated. Promotion state is exposed on the canonical billing catalog API (`GET /api/billing/catalog/` and owner billing `catalog`) for every client (public pricing, Workspace Subscription, future iOS/Android/desktop). Clients must not hardcode active promotion percentages. USD first-period amounts use Decimal + ROUND_HALF_UP to the nearest cent on the backend. Provider-side Stripe/Apple/Google offer mappings are a **separate** later task; until those offers are wired, checkout must not silently charge a discounted amount while the UI shows a promotion (`checkout_applies_promotion` remains false). |
| **Reason** | One admin switch must drive promotional presentation everywhere without redeploying clients, while keeping permanent prices and payment-provider wiring separate. |
| **Status** | superseded |
| **Clarifies** | DEC-077, DEC-082, OPEN-024 (global promotion mode foundation; provider offer IDs still open) |
| **Superseded by** | [DEC-090](#dec-090--eligibility-based-promotion-groups) |

### DEC-090 — Eligibility-based promotion groups

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Decision** | CheckStation promotions are **four independent eligibility groups**, not one global mode for every visitor. **Group 1 New/Basic** (`off` / `normal` / `big`): acquisition offers for **public visitors and Basic workspaces only** — marketing labels NORMAL = 50% first month / 30% first year; BIG = 70% first month / 50% first year; then normal recurring. **Group 2 Plus Monthly** (`off` / `on`): when ON — (A) Business Monthly first **2** periods at the subscriber’s **current Plus Monthly catalog price**, then normal Business Monthly; (B) Plus Yearly **30%** off first year; (C) Business Yearly **20%** off first year. **Group 3 Plus Yearly** (`off` / `on`): when ON — **50% off the provider-calculated remaining prorated upgrade** from Plus Yearly → Business Yearly (not 50% off full Business Yearly), then normal Business Yearly renewal. **Group 4 Business Monthly** (`off` / `on`): when ON — Business Yearly **30%** off first year. **Business Yearly has no promotion group.** All four groups may be ON simultaneously; backend eligibility returns **exactly one** matching group (or none). Permanent catalog prices never mutate. Canonical APIs expose audience-aware `promotion` (`group`, `mode`, `offers[]` with provider-neutral offer types including `discount_type`, fixed `discount_amount`, and exact `promotional_amount`). **For the 11 simple Stripe fixed-amount coupons**, displayed first-period prices are **`normal − fixed coupon off-amount`** (integer cents / Decimal money fields) — never `normal × (1 − marketing %)`. Marketing percentages remain copy labels only (customer still receives at least the stated discount). Clients must not recalculate promotional amounts from percents. Two special offers remain separate (match-current-price intro; prorated upgrade). |
| **Reason** | Retention/upgrade campaigns must not leak acquisition discounts to paid subscribers, and paid tiers need distinct commercial rules while sharing one backend source of truth. Fixed Stripe coupons must match catalog/Workspace/public pricing display and Checkout first charge. |
| **Status** | superseded |
| **Clarifies** | DEC-077, DEC-082; supersedes DEC-089’s “one mode for everybody” model while preserving Group 1 OFF/NORMAL/BIG marketing percents for New/Basic only |
| **Does not change** | Permanent USD list prices (DEC-077) |
| **Superseded by** | [DEC-091](#dec-091--v1-promotion-groups-simplified) |

### DEC-091 — V1 promotion groups simplified

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Decision** | Final V1 promotions are **three** eligibility groups. **Group 1 New/Basic** (`off` / `normal` / `big`): public + Basic only — marketing NORMAL 50% first month / 30% first year; BIG 70% / 50%; amounts from fixed Stripe coupons (`normal − off-amount`). **Group 2 Plus Monthly** (`off` / `on`): when ON — Plus Yearly **30%** first year ($69.90) and Business Yearly **30%** first year ($104.90); no other Plus Monthly offer. **Group 3 Business Monthly** (`off` / `on`): when ON — Business Yearly **30%** first year ($104.90). **Plus Yearly and Business Yearly have no promotion.** Removed from V1 (not implemented): Plus Monthly→Business Monthly “2 months at Plus price”; Plus Yearly→Business Yearly 50% prorated upgrade promo; Plus Monthly→Business Yearly 20%. Plus Monthly→Business Yearly and Business Monthly→Business Yearly **reuse** `STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY` ($45 off); eligibility is server-side. Permanent catalog prices never mutate. Clients render backend promotional amounts only. |
| **Reason** | Drop unfinished special offers; keep a small, Stripe-aligned V1 set that admin can operate without placeholders. |
| **Status** | confirmed |
| **Clarifies / supersedes** | [DEC-090](#dec-090--eligibility-based-promotion-groups) commercial offer set (eligibility-group architecture retained) |
| **Does not change** | Permanent USD list prices (DEC-077); normal non-promotional Plus Yearly→Business upgrades |

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Decision** | CheckStation Status is an **API-first** public health surface. A dedicated Status service owns probes, SQLite state, incidents, and maintenance. It exposes a public read-only JSON API consumed by the standalone status website (production: `status.checkstation.alekspetk.com`) and, later, in-app Status views on web workspace, iOS, Android, and desktop — without requiring a browser or workspace login. The promotional footer Status link opens the Status website. The Status service must remain available when Django, PostgreSQL, or the main frontend is down. Component states never default to Operational; missing, unconfigured, or stale checks are Unknown. Platform Email Delivery means Resend only, not tenant Group SMTP. Shared public content (Status now; Documentation, Privacy, Terms, Support) should have one canonical source so clients do not duplicate manual copy. Documentation, Privacy, Terms, FAQ, and Support canonical content is implemented in DEC-086 and DEC-087. |
| **Reason** | Customers and future native apps need the same truthful status data. Serving status from Django or the main SPA would hide outages of those systems. |
| **Status** | confirmed |

### DEC-086 — Docs and legal content are API-first

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Decision** | **DOCS/LEGAL CONTENT IS API-FIRST.** Canonical Documentation, Privacy Policy, Terms of Use, Getting Started, Groups & Members, Kiosk Setup, Billing & Plans, FAQ, and Support live in Django and are exposed by a public read-only Content API. **FAQ is structured** (`content.FaqEntry`: stable id/slug, question, Markdown answer, category, keywords, sort order, publish flags, optional related document). It is not a giant Markdown-only article and is not duplicated into website JavaScript. The standalone Docs website (local `http://localhost:8091`, future `docs.checkstation.alekspetk.com`) is **one client** and may filter published FAQ entries client-side. Future Workspace, iOS, Android, and desktop Help screens must fetch the same documents/FAQ API and render inside the app — no scraping HTML, no required browser redirect, and no external search infrastructure. Plan prices/limits in Docs are substituted from the canonical entitlement and billing catalogs (plus `GET /api/content/catalog/`). The promotional website footer opens Docs destinations in a new tab. Platform operators edit documents and FAQ entries in Django admin (not workspace admins). Drafts, `admin_notes`, and unpublished rows are never public. The Website footer **Get started** item remains the registration CTA and is not a Docs article. Privacy/Terms are launch-quality drafts that require professional legal review (Japan/APPI, subscription rules, app stores) before production; that review status is internal (`backend/content/LEGAL_REVIEW.md`) and is not shown as a public “draft” banner. **Support is the Docs self-service hub** (DEC-087). In-app embedded Docs/Support/Contact screens remain later. |
| **Reason** | Legal and help text must stay consistent across web, mobile, and desktop without copying Markdown or FAQ into each frontend. |
| **Status** | confirmed |
| **Depends on** | DEC-085 (canonical public content pattern) |

### DEC-087 — Public Contact and Docs Support hub

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Decision** | **Contact lives on the main public CheckStation site** at `/contact`. It is not a Docs page, not a Workspace page, and not authenticated. The promotional footer Contact link stays on this site in the same tab. **Support lives in Docs/help** (`/support` on the Docs origin). Support is self-service first: search canonical FAQ data, show a compact Status summary from the independent Status API, then offer Contact. Category/subcategory on Contact drives FAQ suggestions via the existing FAQ API; FAQ answers are not duplicated into the Contact frontend. `GET /api/contact/categories/` and `POST /api/contact/` are reusable by future Workspace, iOS, Android, and desktop clients. Contact requests are persisted (`contact.ContactRequest`) even if outbound email fails. Public destination is `contact@checkstation.alekspetk.com` (Cloudflare Email Routing). The private forwarding mailbox is not part of application config or public content. From address stays the verified CheckStation sender; Reply-To is the submitter. Cloudflare Turnstile protects the public form (official dummy keys allowed in DEBUG only; production fails closed if misconfigured). Honeypot + IP rate limiting apply. Privacy/legal Contact submissions are flagged only — not automatically executed. Platform Django admin can view/filter/search requests and set new/reviewed/closed. No ticketing, attachments, live chat, or in-app embedded Help in this slice. |
| **Reason** | Keep help content canonical, keep Contact on the promotional site, and give future native clients one Contact API and one FAQ/Status source. |
| **Status** | confirmed |
| **Depends on** | DEC-086 (Docs/FAQ API), DEC-085 (Status API) |

### DEC-088 — Production domain family is checkstation.app

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Decision** | The owned domain **`checkstation.app`** is the canonical public brand and production domain family. It **replaces** the temporary `*.checkstation.alekspetk.com` hostnames that appeared as production examples in DEC-085, DEC-086, and DEC-087. Those earlier decisions remain historically accurate for 2026-08-26; this decision freezes the successor hostnames. **Frozen public origins:** `checkstation.app` (promotional website, including public Contact at `/contact` and the registration entry point); `workspace.checkstation.app` (owner/staff login, workspace UI, account/security, subscription/billing, password reset, email verification, and account-related callback flows); `docs.checkstation.app` (Documentation home, Getting Started, Groups & Members, Kiosk Setup, Billing & Plans, FAQ, Privacy Policy, Terms of Use, Support); `status.checkstation.app` (standalone public Status page and public Status API). **Intended production email:** platform transactional From `accounts@checkstation.app` (`RESEND_FROM_EMAIL`); public Contact destination `contact@checkstation.app` (`CONTACT_TO_EMAIL`). `LEGAL_CONTACT_EMAIL` remains a separate published-legal placeholder even when it uses the same mailbox. **Intended future link origins (not implemented in this decision):** auth/account/billing/Stripe return URLs use `workspace.checkstation.app`; public Contact stays on `checkstation.app`; Docs and Status use their frozen origins. **Platform administration** uses a **dedicated private management origin**, separate from the public and workspace sites. The exact manager hostname is **not** published in README, PRODUCT, or other public-facing docs; it belongs in private/gitignored deployment env later. Hostname obscurity is **not** a security control. Platform-admin authentication and mandatory 2FA remain required (DEC-030 / SECURITY.md). **The production API hostname/routing is intentionally unfrozen** until Nginx/reverse-proxy design is finalized. The API may later be same-origin under workspace, a separate API hostname, or another reverse-proxy arrangement — do not invent `api.checkstation.app` now. Local development remains localhost (frontend `5173`, API `8000`, Status `8090`, Docs `8091`). DNS, cookies, CORS, redirects, and application origin wiring are **not** changed by this decision. |
| **Reason** | CheckStation now owns `checkstation.app`. Continuing to treat `alekspetk.com` subdomains as the production family would freeze a temporary personal domain into product architecture. Splitting promotional, workspace, Docs, and Status origins matches the already-distinct product surfaces (DEC-034, DEC-085–087) without requiring those historical records to be rewritten. |
| **Status** | confirmed |
| **Clarifies** | DEC-034 (distinct public site vs workspace vs kiosk; production hostnames now frozen), DEC-085 (Status production origin), DEC-086 (Docs production origin), DEC-087 (Contact lives on the promotional origin; production Contact mailbox) |
| **Does not change** | DEC-085/086/087 historical text; local localhost URLs; application behavior; API hostname |

---

## Open Decisions

Unresolved questions requiring explicit approval before implementation.

| ID | Topic | Notes |
|----|-------|-------|
| OPEN-002 | Action/state model | How actions relate to participant current state. Repeated Actions and simple presets are product-confirmed (DEC-039); implementation remains open |
| OPEN-003 | Configurable field types and MVP scope | Which field types and how many per Group |
| OPEN-004 | Kiosk security and session model | Device credentials remain open. Group-owned **kiosk exit code** (hashed, 4–10 alphanumeric) replaces owner-password exit for real launch (DEC-057). Interim app-session kiosk lock remains until device credentials are designed. |
| OPEN-005 | Organization role capability matrix | **Frozen (DEC-070 Admin, DEC-071 Staff).** Owner/Admin/Staff role names unchanged |
| OPEN-006 | Notification engine architecture | Group after-action senders implemented for Custom SMTP, Gmail App Password, Outlook/Microsoft 365 SMTP, and Yahoo Mail App Password (DEC-059–062). Multiple participation emails (max 3) confirmed in DEC-069. Group Forward Emails (max 3 private copies) confirmed in DEC-068. Broader templates/triggers/channels and Gmail/Microsoft/Yahoo OAuth remain open. No further dedicated MVP mailbox providers planned. |
| OPEN-007 | Plan prices and Event plan axes | **V1 prices frozen (DEC-077).** Remaining open: Event-specific quotas vs Group axes |
| OPEN-008 | Free trial duration | Business trial **behavior** frozen (DEC-078). **Exact duration still TBD** / later configurable. Do not invent 7 or 14 days. |
| OPEN-009 | Historical record retention policy | Archival, deletion, and compliance requirements. Event Entries may exist without Members while Action Records remain (DEC-045); how those records survive Event archival vs deletion (DEC-023) is part of this design. |
| OPEN-010 | Database implementation and API design | Organization owner + WorkspaceStaffAccount models, constraints, and a minimal current-workspace API now exist. Remaining tenant/person models, broader REST/API design, and tenant-enforcement mechanisms (e.g. RLS) remain undecided |
| OPEN-011 | Stripe live configuration & remaining provider gaps | **Architecture implemented (Phase 2):** Checkout Session, Customer Portal, upgrade preview/apply, period-end downgrade, **scheduled interval/combined plan+interval changes**, cancel-at-period-end, resume cancellation, cancel scheduled changes, signed webhooks + `ProviderEvent` idempotency, owner billing APIs/UI, fake provider for tests. **Still open:** creating the real Stripe account; supplying TEST credentials; live end-to-end verification; production webhook URL + Customer Portal branding in Stripe Dashboard |
| OPEN-012 | Image optimization specifications | Max dimensions, formats, thumbnail strategy |
| OPEN-013 | MVP feature final checklist | Which candidate features are in vs out |
| OPEN-014 | Group-only participant to Member linking | Conversion workflow and duplicate detection |
| OPEN-015 | App store billing for mobile | Apple/Google requirements research needed; purchase-source persistence exists (DEC-075, DEC-081); Account UI hides Stripe controls for `purchase_source=apple` |
| OPEN-016 | Platform administration tooling scope | What platform operators need at launch vs later |
| OPEN-017 | Export formats for MVP | Attendance Report exports PDF, Excel (.xlsx), and CSV from the shared report payload (DEC-063). **Plan gating:** Basic has no CSV/Excel/PDF export; Plus/Business have full export (DEC-072). |
| OPEN-018 | Manual correction and audit workflow | How corrections interact with historical integrity |
| OPEN-019 | Event integration with Members/Groups | Advanced optional linking behavior |
| OPEN-020 | Kiosk/Group/Event identification methods for MVP | Product allows different predefined methods per Group/Event owned kiosk (DEC-038, DEC-044). Which methods belong in MVP is still open. DEC-041 (workspace kiosk assigned to Groups/Events) is superseded. |
| OPEN-021 | Minimum Member data | **Resolved by DEC-053.** Name is the only universally required Organization-level Member field. Email, date of birth, phone, address, photo, and notes are optional. Member-level PIN/identifier are not profile fields. Contextual Group/Event requirements remain (DEC-046). |
| OPEN-022 | Event Entry future structure | Whether future architecture will split generic Event Entries into separate concepts such as Reservation → Attendees, and under what circumstances. |
| OPEN-023 | Action Record source/context implementation | Product-level sources confirmed: kiosk, staff/admin, automatic/preset (DEC-040). Exact fields, whether a kiosk reference is always stored, and other sources remain undesigned |
| OPEN-024 | Organization billing lifecycle | Workspace-before-paid-subscription is confirmed (DEC-035). Commercial rules for trial conversion, immediate upgrades, scheduled downgrade/cancel, **scheduled interval/combined changes** (DEC-084), **reversal of scheduled cancel/downgrade/interval/combined changes before effective end** (DEC-083), and 3-day payment grace are frozen (DEC-078–080, DEC-083–084). Stripe execution path exists (OPEN-011 narrowed). **V1 promotion groups frozen (DEC-091)** with fixed Stripe coupon mapping for the 10 simple offers. Remaining elsewhere: trial **duration**, Apple IAP execution |
| OPEN-025 | User/staff ↔ Member explicit linking | Same real-world person may later be both a WorkspaceStaffAccount and a Member (or a paying User and a Member). Any explicit link, deduplication, or conversion mechanism remains undecided. Do not invent a required link during foundation implementation. |
| OPEN-027 | Kiosk data model | **Partially resolved (2026-08-20).** Group behavioral kiosk settings live in `KioskSettings` (OneToOne Group). Visual design stays in `KioskDesign`. See DEC-057. Event kiosk storage and device credentials remain future work. |
| OPEN-028 | Multiple kiosk variants per Group or Event | Explicitly **not** an MVP requirement. Future decision. Initial product direction is one owned configuration per Group and per Event (DEC-044). |
| OPEN-029 | Production API hostname / reverse-proxy arrangement | **Intentionally unfrozen (DEC-088).** Do not invent `api.checkstation.app`. Decide with Nginx/deployment design: same-origin under workspace, a separate API hostname, or another reverse-proxy arrangement. Cookie/CORS/CSRF implications of splitting `checkstation.app` vs `workspace.checkstation.app` are part of that later implementation, not this decision. |

---

## How to Use This Log

1. Add new decisions with the next `DEC-###` ID when the project owner approves them.
2. Move resolved items from Open Decisions to Confirmed Decisions.
3. Mark superseded decisions with status `superseded` and reference the replacing decision.
4. Do not log speculative ideas as confirmed decisions.
