# MVP Scope

Initial structure for MVP boundaries. **Do not treat candidate or example items as confirmed requirements.**

For confirmed product decisions, see [DECISIONS.md](./DECISIONS.md). For full product definition, see [PRODUCT.md](./PRODUCT.md).

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
| Group-only participants (without full Member profiles) | Confirmed |
| Every performed Action creates an Action Record; historical integrity must be preserved | Confirmed |
| Kiosks are separate participant-facing interfaces, not admin pages | Confirmed |
| MVP must not become a general-purpose workflow engine | Confirmed |
| No arbitrary form-builder or page-builder in MVP | Confirmed |
| Product and architecture designed before implementation | Confirmed |

**Historical integrity (confirmed product direction, not full MVP scope):**

- Every performed Action creates an **Action Record**
- The product must not store only current participant state
- Action Records must not be silently overwritten or manipulated in a way that destroys history
- Manual correction and audit architecture remain separately scoped (not assumed MVP)

---

## Candidate MVP Features

Features aligned with core product concepts that **likely** belong in MVP but are **not yet explicitly approved** as MVP scope. Each requires confirmation before implementation.

### Organization & Tenancy

- [ ] Organization creation and settings
- [ ] Strict tenant data isolation
- [ ] Organization admin/staff access (basic permissions — exact model undecided)

### Users

- [ ] Platform User accounts
- [ ] User association with one or more Organizations

### Members & Groups

- [ ] Canonical Organization Member profiles
- [ ] Group creation and management
- [ ] Member attachment to Groups via Group Membership
- [ ] Group-specific field overrides (without changing canonical Member data)
- [ ] Group-only participants
- [ ] Configurable member/participant fields (limited scope — field types undecided)

### Actions & History

- [ ] Configurable actions per Group/Event (within non-workflow-engine constraints)
- [ ] Action Record creation for every performed Action
- [ ] Basic history viewing (filtering/search depth undecided)

Do **not** add advanced audit/correction features to MVP here.

### Events & Event Entries

- [ ] Standalone one-time Events (temporary or one-time check-in context; no persistent Member/Group required)
- [ ] Event Entries (temporary records belonging to an Event)
- [ ] Event-specific Actions (e.g., Arrived)
- [ ] At least one appropriate Event identification pattern (exact method(s) undecided; reservation/reference number may be an example)
- [ ] Event deletion warnings
- [ ] Export/download before destructive Event deletion

Do **not** require reservation-number identification specifically. Do **not** imply all Events are reservation-based.

### Kiosks

- [ ] Saved Kiosk configurations
- [ ] Participant-facing Kiosk Mode (no admin dashboard exposure)
- [ ] At least one identification pattern (exact MVP methods undecided; examples may include name selection/search, PIN, reservation/reference number, or other suitable methods)
- [ ] Limited kiosk branding (colors, logo, title)

Do **not** confirm QR or every possible identification method for MVP.

### Notifications

- [ ] Basic transactional email notifications triggered by actions (scope undecided)

### Reporting & Export

- [ ] Basic reporting/history views
- [ ] CSV export

Excel and PDF exports remain **Post-MVP** for now.

### Subscriptions & Billing

- [ ] Recurring subscription model
- [ ] Plan-based limits enforcement (exact limits undecided)
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
- Verified custom email domains for notifications
- Light/dark/system mode and visual themes for admin UI
- Additional kiosk identification methods (QR code, etc.)
- Excel and PDF report exports
- Hours calculations and attendance summaries
- Manual corrections with audit history
- Advanced notification recipients and rules
- Native/desktop applications (macOS, Windows)
- Platform administration tooling (full scope)
- Role-based permissions beyond basic admin/staff

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
| Action/state model | How actions relate to participant current state |
| Configurable field types and limits | What field types MVP supports |
| Minimum Member data | Which Organization-level Member fields, if any, are universally required |
| Kiosk security and session model | Device credentials, session management, authentication |
| Permission/role model | Admin vs staff capabilities and granularity |
| Notification engine architecture | Templates, triggers, variables, delivery pipeline |
| Plan names, pricing, and exact limits | Basic/Pro/Business examples are illustrative |
| Free trial duration and behavior | ~7 days is direction only |
| Action Record retention policy | Archival, deletion, and compliance requirements; separate from media storage quotas |
| Action Record source/context | Whether every Action Record requires Kiosk/device/session reference vs admin/manual/API/other sources |
| Database and API architecture | Not yet designed; no tables approved |
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
