# MVP Scope

Initial structure for MVP boundaries. **Do not treat candidate or example items as confirmed requirements.**

For confirmed product decisions and architecture, see [DECISIONS.md](./DECISIONS.md) and [ARCHITECTURE.md](./ARCHITECTURE.md). For full product definition, see [PRODUCT.md](./PRODUCT.md).

---

## Confirmed MVP Direction

This section contains:

- **Confirmed foundational product concepts** the platform must support over time
- **Confirmed development and scope constraints** that bound MVP design
- **Concepts the MVP must be designed around**, even when every related capability is not yet approved for launch

It does **not** mean every advanced capability related to those concepts must ship in MVP.

**Example:** Events are a confirmed core product concept, but advanced Event identification methods, Event/Member integration, advanced reports, and similar capabilities are **not** automatically MVP.

These directions describe **approach and discipline**, not a finalized feature checklist.

| Direction | Status |
|-----------|--------|
| Multi-tenant SaaS with strict Organization isolation | Confirmed |
| Generic, industry-agnostic design (not school-only or company-only) | Confirmed |
| Backend first (Django + DRF), then React web frontend | Confirmed |
| Mobile, native, and desktop apps are **out of MVP scope** | Confirmed |
| Standalone Events with Event Entries are a **core product concept** | Confirmed |
| Canonical Members with Group Memberships and Group-specific overrides | Confirmed |
| Paying User owns exactly one Organization; workspace admin/staff are WorkspaceStaffAccount | Confirmed |
| Workspace ID is system-generated, immutable, and used for staff/admin login; staff usernames are unique per workspace only | Confirmed |
| Organization is an internal tenant/workspace model, not a required customer-facing display name | Confirmed |
| Organization as customer workspace / tenant / subscription boundary | Confirmed |
| Workspace may begin trial/unsubscribed and later activate by subscription | Confirmed |
| Customer paying User owns exactly one Organization; no org-switching in one login | Confirmed |
| One User account has one globally unique normalized email | Confirmed |
| User (login account) ≠ Member (tracked person); Members do not access the workspace | Confirmed |
| Subscriptions belong to Organization workspaces, not Members | Confirmed |
| Platform operator admin access separate from Organization customer roles | Confirmed |
| Group-only participants (without full Member profiles) | Confirmed |
| Groups are **long-lived reusable** participation contexts (not just folders) using predefined building blocks; Events are **temporary/one-time** participation contexts | Confirmed |
| One Organization workspace may contain any mix of Groups and Events (school, hobby, team, one-time Event, etc.) | Confirmed |
| Each Group owns its kiosk configuration; each Event owns its kiosk configuration | Confirmed |
| Kiosk configuration is **not** a global workspace resource assigned to arbitrary Groups/Events | Confirmed |
| Initial product direction: **one** owned kiosk configuration per Group and per Event; multiple variants are future, not MVP | Confirmed |
| Event Entries may be temporary people without creating reusable Members; Action Records still remain | Confirmed |
| Participant field requirements are **contextual** to a Group/Event workflow, not globally mandatory on all Members | Confirmed |
| Plan limits may later treat persistent Groups and Events differently; actual numbers are not decided | Confirmed |
| Action Records preserve creation source (kiosk, staff/admin, automatic/preset) and stay accurate after later config changes | Confirmed |
| Public site (marketing/SEO/pricing/auth) is distinct from Organization workspace and Kiosk Mode | Confirmed |
| Workspace UI uses platform design system; kiosks may have more constrained branding | Confirmed |
| Every performed Action creates an Action Record; historical integrity must be preserved | Confirmed |
| Kiosks are separate participant-facing interfaces, not admin pages | Confirmed |
| MVP must not become a general-purpose workflow engine | Confirmed |
| No arbitrary form-builder or page-builder in MVP | Confirmed |
| Product and architecture designed before implementation | Confirmed |

**Historical integrity (confirmed product direction, not full MVP scope):**

- Every performed Action creates an **Action Record**
- The product must not store only current participant state
- Action Records must not be silently overwritten or manipulated in a way that destroys history
- History must remain accurate when later Group/Kiosk/Action configuration changes
- Manual correction and audit architecture remain separately scoped (not assumed MVP)

---

## Candidate MVP Features

Features aligned with core product concepts that **likely** belong in MVP but are **not yet explicitly approved** as MVP scope. Each requires confirmation before implementation.

### Public website

- [ ] Public homepage / product explanation
- [ ] Pricing page
- [ ] Registration and login
- [ ] Sitemap and robots.txt

SEO/promotional page set is confirmed product direction; exact launch page inventory remains Candidate.

### Organization & Tenancy

- [ ] Organization creation and settings
- [ ] Strict tenant data isolation
- [ ] Paying User owns exactly one Organization (one-to-one owner)
- [ ] WorkspaceStaffAccount for customer-created admin/staff (capability matrix undecided)
- [ ] Staff login uses Workspace ID + username + password; usernames unique per workspace only
- [ ] Workspace roles: owner (paying User), admin/staff (WorkspaceStaffAccount)

### Users

- [ ] Platform User accounts
- [ ] Paying User owns exactly one Organization; no org-switching in one login

### Members & Groups

- [ ] Canonical Organization Member profiles (Members do not access the workspace)
- [ ] Group creation and management (Groups are persistent participation contexts, not just folders)
- [ ] Member attachment to Groups via Group Membership
- [ ] Group-specific field overrides (without changing canonical Member data)
- [ ] Group-only participants
- [ ] Per-Group predefined identification methods (exact MVP methods undecided)
- [ ] Configurable member/participant fields (limited scope — field types undecided; requirements are contextual, not globally mandatory)

### Actions & History

- [ ] Configurable predefined Actions per Group/Event (within non-workflow-engine constraints)
- [ ] Repeated Actions (e.g. multiple break cycles)
- [ ] Action Record creation for every performed Action
- [ ] Action Record creation source (kiosk, staff/admin, automatic/preset — implementation undesigned)
- [ ] Basic history viewing (filtering/search depth undecided)

Do **not** add advanced audit/correction features or a generic workflow engine to MVP here. Simple preset/automatic attendance is confirmed product direction; whether it ships in MVP is still Candidate/undecided.

### Events & Event Entries

- [ ] Standalone one-time Events (temporary participation context; no persistent Member/Group required)
- [ ] Event Entries (temporary records belonging to an Event; may exist without creating reusable Members; Action Records still remain)
- [ ] Event-specific Actions (e.g., Arrived)
- [ ] Event-owned kiosk configuration (separate from any Group kiosk)
- [ ] At least one appropriate Event identification pattern (exact method(s) undecided; reservation/reference number may be an example)
- [ ] Event deletion warnings
- [ ] Export/download before destructive Event deletion

Do **not** require reservation-number identification specifically. Do **not** imply all Events are reservation-based.

### Kiosks

- [ ] Each Group owns one kiosk configuration (initial product direction)
- [ ] Each Event owns one kiosk configuration (initial product direction)
- [ ] Participant-facing Kiosk Mode (no workspace/admin dashboard exposure)
- [ ] At least one identification pattern (exact MVP methods undecided; examples may include visible-name selection, PIN with no names shown, Member ID + PIN, reservation/reference number)
- [ ] Constrained kiosk branding (logo, selected colors, prepared presentation options)

Do **not** treat kiosks as global workspace resources assigned to multiple Groups/Events. Do **not** confirm multiple kiosk variants per Group/Event for MVP. Do **not** confirm QR or every possible identification method for MVP.

### Notifications

- [ ] Predefined post-Action outcomes (success message only and/or email/notification — exact MVP set undecided)
- [ ] Basic transactional email notifications triggered by actions (scope undecided)
- [ ] Default platform email delivery without customer DNS

Verified custom sending domains remain **Post-MVP / future**.

### Reporting & Export

- [ ] Basic reporting/history views
- [ ] CSV export

Excel and PDF exports remain **Post-MVP** for now.

### Subscriptions & Billing

- [ ] Recurring subscription model (Organization is the subscription boundary)
- [ ] Workspace may start trial/unsubscribed (exact trial rules undecided)
- [ ] Plan-based limits enforcement (exact limits undecided; Groups and Events may be limited on different axes)
- [ ] Web billing integration (Stripe likely — not confirmed)

Do not treat Stripe as confirmed implementation. Do not design billing architecture in this file.

### Storage

- [ ] Media upload with automatic image optimization
- [ ] Storage quotas based on optimized assets (exact quotas undecided)

---

## Post-MVP Ideas

Features explicitly described as future or later-phase. **Not MVP.**

- Mobile frontend (React Native / Expo)
- Linking/converting Group-only participants to canonical Members
- Duplicate detection and participant linking
- Advanced Member/Group integration with Events
- Multiple kiosk configurations / variants per Group or Event
- Verified custom email domains for notifications
- Light/dark/system mode and visual themes for admin/workspace UI
- Additional kiosk identification methods (QR code, etc.)
- Simple preset/automatic attendance beyond whatever is confirmed for MVP
- Excel and PDF report exports
- Hours calculations and attendance summaries
- Manual corrections with audit history
- Advanced notification recipients and rules
- Native/desktop applications (macOS, Windows)
- Platform administration tooling (full scope)
- Role-based permissions beyond basic owner/admin/staff capability matrix

**Note:** Full Platform administration tooling is outside current MVP scope. That does **not** mean the launch product will have zero platform-operator controls. The minimum Platform administration capabilities required for launch remain an open design question.

---

## Advanced / Future Ideas

Longer-term or explicitly deferred capabilities.

- Apple App Store and Google Play billing (requires research before implementation)
- Arbitrary workflow/automation engine (explicitly **not approved**)
- Arbitrary CSS customization or page-builder for kiosks or admin UI
- Word/DOCX export
- Full arbitrary form-builder
- Complex conditional notification logic
- Automatic deletion of old Events based on age alone

---

## Still Undecided

Items requiring explicit design and approval before categorization.

| Topic | Notes |
|-------|-------|
| Action/state model | How actions relate to participant current state; repeated cycles and preset/automatic behavior are product-confirmed but undesigned |
| Configurable field types and limits | What field types MVP supports |
| Minimum Member data | Contextual Group/Event requirements are confirmed (DEC-046). Whether any Organization-level Member fields are universally required remains open. Do not assume email, phone, photo, member code, etc. are globally mandatory. |
| Kiosk security and session model | Device credentials, session management, authentication. Distinct from Group/Event-owned kiosk configuration (DEC-044). |
| Kiosk data model | Whether kiosk configuration is stored as fields on Group/Event or as a separate entity; exact fields. Ownership is confirmed; schema is not. |
| Permission/role capability matrix | Exact capabilities for owner, admin, and staff undecided |
| Notification engine architecture | Templates, triggers, variables, delivery pipeline; which predefined outcomes ship in MVP |
| Plan names, pricing, and exact limits | Basic/Pro/Business examples are illustrative. Groups and Events may later be limited differently; do not decide numbers yet. |
| Free trial duration and behavior | Workspace may start trial/unsubscribed; ~7 days is direction only |
| Action Record retention policy | Archival, deletion, and compliance requirements; separate from media storage quotas |
| Action Record source/context implementation | Product sources confirmed (kiosk, staff/admin, automatic/preset); exact fields undesigned |
| Database implementation and API design | Organization owner + WorkspaceStaffAccount models and a minimal current-workspace API exist. Remaining tenant/person models, broader APIs, and tenant-enforcement mechanisms remain undecided |
| MVP feature final checklist | Requires explicit approval session |
| Stripe integration details | Subject to later design/research; not confirmed implementation |
| Image optimization specifications | Dimensions, formats, variants |
| MVP Event identification methods | Which identification pattern(s) belong in MVP |
| Event Entry future structure | Whether Event Entries later split into Reservation → Attendees |
| Organization billing lifecycle | How trial, subscribed, cancelled, suspended, and other states relate to Subscription and access |
| Minimum Platform administration for launch | Required operator controls at launch vs full tooling deferred Post-MVP |

---

## Scope Discipline

When evaluating any new idea:

1. Assign it to **Confirmed MVP Direction**, **Candidate MVP**, **Post-MVP**, **Advanced/Future**, or **Still Undecided**.
2. Do not silently move Post-MVP items into MVP.
3. Do not treat candidate features as confirmed MVP features.
4. Do not treat examples (customer types, plan limits, field lists, identification methods) as confirmed requirements.
5. Update this file when the project owner approves scope changes.
