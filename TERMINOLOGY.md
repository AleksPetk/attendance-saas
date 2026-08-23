# Terminology

Canonical and provisional product terms for the Configurable Check-In / Attendance SaaS Platform.

Terms marked **(provisional)** require final approval. Terms marked **(confirmed)** are established in current product planning.

---

## Platform Level

### Platform **(confirmed)**

The SaaS system operated by the platform team. Encompasses all Organizations, infrastructure, billing, and platform administration.

### Public website **(confirmed concept)**

The unauthenticated browser marketing/product site: promotional and SEO pages, homepage, product explanation, pricing, registration/login, sitemap, and `robots.txt`. Distinct from the Organization **workspace** and from **Kiosk Mode**.

### User **(confirmed)**

A **platform-level login account**. Used for platform operators and the **paying customer** who owns exactly one Organization **workspace**. A User is **not** a WorkspaceStaffAccount, a Member, or a Participant.

Each User account has **one globally unique, normalized (lowercase) email**. Paying customers must verify that email before using the workspace. WorkspaceStaffAccount logins are not part of that verification flow.

A paying customer does not switch Organizations. If the same real person operates two separate Organization **workspaces**, they use separate User accounts (and therefore separate emails). One workspace may contain any mix of Groups and Events (school, hobby, team, one-time Event).

Customer-created workspace admin/staff are **not** Users. Platform operator accounts also use the User model; `is_staff` / `is_superuser` are global platform-admin flags, not workspace roles. See [SECURITY.md](./SECURITY.md).

### WorkspaceStaffAccount **(confirmed)**

Customer-created **admin** or **staff** login scoped to exactly one **Organization**. Not `accounts.User`, not the paying owner, and not a Member. Cannot move between workspaces. **Username is unique per workspace only**; the same username may exist in other workspaces. Staff login uses **Workspace ID + username + password**. Optional email uniqueness remains per Organization.

Architecture entity name: **WorkspaceStaffAccount**. See [ARCHITECTURE.md](./ARCHITECTURE.md).

### OrganizationMembership **(retired)**

Retired. Workspace admin/staff are no longer global Users linked through OrganizationMembership. See DEC-047.

### Organization role **(confirmed names; capabilities provisional)**

- **owner** — the paying customer User (`Organization.owner`)
- **admin** — a WorkspaceStaffAccount in that Organization
- **staff** — a WorkspaceStaffAccount in that Organization

Exact capability and permission differences remain **undecided**.

### Plan **(confirmed concept, details provisional)**

A subscription tier (e.g., Basic, Pro, Business) defining feature access and usage limits. Exact names, prices, and limits are **not finalized**.

### Subscription **(confirmed concept, details provisional)**

An Organization workspace's billing relationship with the Platform. Tied to a Plan. Belongs to the **Organization**, not to Members. Implementation details undecided. Subscription/billing status is separate from Organization identity.

---

## Organization Level

### Organization **(confirmed)**

The customer **workspace**, **tenant**, and **subscription boundary** on the Platform. Organization is an **internal technical model**, not a customer-facing legal/business entity or required display name.

The real-world legal form of the customer (company, school, gym, individual business, etc.) does not change the platform model. Each Organization has **exactly one paying owner User**, a system-generated immutable **Workspace ID**, and may have additional **WorkspaceStaffAccount** admin/staff logins.

One paying customer User owns **one** workspace and may use it for **any mix** of real-world activities (businesses, schools, hobbies, teams, one-time Events) as Groups and Events inside that Organization. Separate User accounts are for **separate workspaces**, not for each activity type.

A workspace may begin in trial or unsubscribed state and later activate through subscription. An Organization may be in trial, actively subscribed, cancelled, suspended, or another billing state. Billing/subscription status is **separate** from the identity of the Organization itself. An Organization is not defined by currently paying.

Tenant isolation remains fundamental: all Organization data is strictly separated from other Organizations.

- Customer Users access the Organization through the **workspace UI** after registration, **email verification**, and login. Workspace admin/staff use WorkspaceStaffAccount. Members do not access the workspace.

### Workspace **(confirmed; synonym)**

The Organization administration experience used by the paying owner and by WorkspaceStaffAccount admin/staff. Same entity as **Organization**. Not the public marketing website and not Kiosk Mode. Paying owners enter via their platform login; workspace staff enter via Workspace ID + username + password.

### Workspace ID **(confirmed)**

A system-generated, globally unique, immutable code assigned to every Organization when it is created. Used so workspace admin/staff can identify which isolated workspace they are accessing. **Not** chosen by the customer, **not** the numeric Organization primary key, and **not** used by the paying owner to enter their workspace.

Architecture field: `Organization.workspace_id`. See [ARCHITECTURE.md](./ARCHITECTURE.md).

### Member **(confirmed)**

A reusable **person profile** belonging to an Organization workspace. It is **not** a kiosk login or security object. A Member **does not access the Organization workspace** and generally does **not** require a User login. A Member may be attached to multiple Groups without duplicating the canonical Member record.

The same real-world person may also have a WorkspaceStaffAccount in the same Organization, but Member and staff login remain separate records and lifecycles. Disabling a WorkspaceStaffAccount must not destroy Member attendance history.

Confirmed Member profile fields:

- **Name** — required. Names are **not** unique; two Members may have exactly the same name.
- **Email** — optional
- **Date of birth** — optional
- **Phone** — optional
- **Address** — optional free-text field
- **Photo** — optional
- **Notes** — optional

The database primary key is the visible Member ID (`#1`, `#2`, `#3` …). It is assigned automatically, immutable, and shown as a quiet reference. Do not invent a customer-facing Member code. Member-level PIN and check-in identifier are **not** part of the Member profile. If those values still exist on the backend, they are deprecated compatibility fields for current Group/Kiosk participation fallback until that slice is redesigned.

**Archive** hides a Member from normal use. An archived Member cannot be opened or edited, and is not operational in Groups or kiosks. Existing GroupMembership rows remain so **Restore** reactivates the same Member ID, profile, and participation. **Permanent delete** is available only for archived Members.

If a Group or Event workflow requires a field, that requirement is validated **for that participation context**, not as a global Member mandate.

Group-specific overrides belong to **Group Membership**, not to the canonical Member record.

### Group **(confirmed)**

A **long-lived, reusable** Organization-defined **participation and activity configuration**, not merely a folder of people, and not a temporary Event. Basic settings: name, check-in, check-out, breaks, maximum breaks (1–3 when enabled), Group participation email/PIN requirements, relevant after-action behavior, and Advanced (Group outgoing email sender). Visible **Group #ID** uses the Django Group PK. Every Group automatically has kiosk capability and its own kiosk design foundation. **Setup incomplete** is an active derived state when participation requirements are unsatisfied. **Archive** hides a Group from normal use while retaining configuration, memberships, and kiosk design. **Restore** reactivates the same Group. **Permanent delete** is archive-only and preserves ActionRecord snapshots.

### Group participant code **(confirmed)**

Immutable Group-scoped code on each GroupMembership and Group-only participant (example `G1-5679`). Not the reusable Member ID. **Canonical kiosk participant identifier** for Card/Input identification (DEC-057).

### Kiosk Settings **(confirmed)**

Behavioral configuration for a Group-owned kiosk: Card vs Input mode, card display fields, input field layout, **attendance reset** (Daily or Rolling cycle boundaries plus manual Reset now), **confirmation screen settings** (preset template, per-enabled-action messages, 1/3/5-second return delay), and hashed kiosk exit code. Separate from Group participation requirements and from Kiosk Design visual editor. One record per Group, created automatically.

### Attendance Reset **(confirmed)**

Kiosk Settings control for when live kiosk state treats participants as starting a fresh operational attendance cycle. Modes: **Daily** (one Group-wide local-time boundary; default 00:00) or **Rolling** (participant-specific window from cycle-start check-in). **Reset now** applies an immediate Group-wide manual boundary without deleting Action Records or changing scheduled settings. Affects live action availability only — History and reports stay complete.

### Kiosk Design **(confirmed)**

Visual appearance of a Group-owned kiosk (colors, typography, images, section styling). The shell always includes Header, Main, and Footer; content may be empty. Header logo and Footer image are independent media fields.

### Kiosk exit code **(confirmed)**

4–10 letter/digit code configured per Group kiosk. Stored hashed; used only to exit real kiosk mode. Not owner account authentication.

### Group Membership **(confirmed)**

The relationship attaching a Member to a Group. Holds Group participant code, Group participation email, Group participation PIN, and optional legacy overrides. Member profile values are separate; Member email may prefill participation email on add only.

Architecture entity name: **GroupMembership**. See [ARCHITECTURE.md](./ARCHITECTURE.md).

**Example:** Canonical email `abc@gmail.com` vs Employee Group email `john@company.com`.

### Group-only Participant **(confirmed)**

A participant added directly to a Group without a full reusable Organization Member profile. Useful for temporary or lightweight participation. May be linkable to a canonical Member in the future.

Product-facing term: **Group-only Participant**. Architecture entity name: **GroupOnlyParticipant**. See [ARCHITECTURE.md](./ARCHITECTURE.md).

### Participant **(confirmed, informal)**

General term for anyone who checks in or has attendance recorded — includes Members, Group-only participants, and Event Entries. Usually does **not** have a platform User account.

---

## Events and Event Entries

### Event **(confirmed)**

A **temporary or one-time** check-in/attendance context belonging to an Organization. It is similar to a **Group** as a participation context (identification, Actions, owned kiosk configuration, outcomes) but has a different **lifecycle**: Group = persistent/reusable; Event = temporary/one-time. It can operate without persistent Members or Groups. An Event **owns its own kiosk configuration**. An Event may contain Event Entries.

**Examples:** seminar, conference, appointment event, one-day activity, reservation-based event.

Reservation-number identification is **one possible Event workflow**, not the definition of Event itself. Event identification may use configured fields such as reservation number. Other future identification methods may include ticket/reference code, name lookup, QR, or another appropriate method. Exact Event identification methods and MVP scope remain subject to later design.

**Critical distinction:** Event is the real-world temporary/one-time context. It must **not** be used for historical records of performed Actions. Those are **Action Records**.

### Event Entry **(confirmed)**

A temporary record belonging to an Event.

Depending on the Event configuration, an Event Entry may represent:

- a reservation
- a booking
- an expected attendee
- a visitor
- another temporary participant record

It does **not** require:

- a platform User account
- an Organization Member
- a Group

Event Entries may represent temporary people without creating reusable Members. Action Records for those people still remain.

Possible data may include reservation/reference number, name, contact information, and other Event-specific fields. These examples are not a final data model. Required fields are contextual to the Event, not globally mandatory Member fields.

**Important:** Do not treat Reservation and Attendee as one canonical term, and do not define the final database model for reservations versus individual attendees yet. In the future, some Events may need a more detailed structure such as one Reservation containing multiple Attendees. **Event Entry** is currently the generic product term so Reservation and Attendee are not forced to mean the same thing.

---

## Actions and History

### Action **(confirmed)**

A configurable operation a participant can perform, selected from **predefined building blocks** (e.g., Check In, Check Out, Break Start, Break End, Enter, Leave, Present, Arrived). Different Groups and Events may allow different Actions. Repeated Actions (e.g., multiple break cycles) must be possible. Simple preset/automatic Actions may exist. Not a general-purpose workflow step.

Conceptually: **Action → performed → Action Record**.

### Action Record **(confirmed)**

The historical record created when an Action is performed. Must preserve **how** the record was created (for example kiosk, staff/admin, or automatic/preset). Must remain historically accurate if later Group, Kiosk, or Action configuration changes.

**Example:**

- Participant: John Smith
- Action: Check In
- Time: 2026-08-17 08:42
- Kiosk: Front Entrance
- Created via: kiosk

Do **not** use Event for this historical concept. The full audit/correction architecture is not yet defined.

Earlier candidate names **Activity Record** and **Attendance Record** are retired; use **Action Record**.

---

## Kiosks and Interfaces

### Kiosk **(confirmed)**

The participant-facing **browser** check-in interface **owned by a Group or an Event**. Not the Organization workspace. **Not** a global workspace resource attached to arbitrary Groups/Events. Each Group owns its kiosk configuration; each Event owns its kiosk configuration. Different Groups/Events may have completely different presentation and behavior. Initial product direction: **one** owned kiosk configuration per Group and per Event; multiple variants per Group/Event are a future decision, not an MVP requirement. Has identification patterns, allowed actions, and controlled customer-facing branding (logo, selected colors, prepared presentation options). Database fields are not designed yet.

### Kiosk Mode **(confirmed)**

The participant-facing operational state of a Group’s or Event’s owned kiosk configuration. Must never expose the Organization administration dashboard.

### Kiosk Session **(provisional)**

An active device/session operating a Group’s or Event’s kiosk. Distinct from that owned kiosk configuration. Concurrent-session limits may be designed later; they are not a substitute for Group/Event counts. Security model undecided.

---

## Notifications

### Group Email Sender **(confirmed)**

Per-Group outgoing email configuration for attendance/after-action messages. Not a global platform sender. Not used for Check Station account emails. Providers: **Custom SMTP**, **Gmail (Google App Password)**, **Outlook / Microsoft 365** (SMTP AUTH; primarily Microsoft 365 business/work with Authenticated SMTP enabled), and **Yahoo Mail** (Yahoo App Password). Future OAuth/token fields may use provider-specific settings without forcing SMTP host/port into every UI. No additional dedicated mailbox providers are planned for the current MVP.

### Notification Rule **(confirmed concept; Group after-action email implemented)**

A configured trigger or **predefined outcome** after an Action (for example success message only, or email/notification to relevant recipients).

**Platform account email** (verification, password reset) uses the platform Resend path and must work without customer DNS.

**Group after-action attendance email** uses the Group’s configured **email sender** (Custom SMTP, Gmail App Password, Outlook / Microsoft 365 SMTP, or Yahoo Mail App Password). Sender must be verified (Ready) before after-action emails can be enabled. Recipient is the Group participation email. Attendance success does not depend on email delivery success. Broader notification-engine features (extra recipients, non-email channels, OAuth providers) remain undesigned.

---

## Data Concepts (Approved Conceptual Architecture)

Conceptual relationships. The tenant/person foundation is approved in [ARCHITECTURE.md](./ARCHITECTURE.md). Group/Event kiosk **ownership** is a confirmed product rule; Kiosk and Event **database models** are not designed yet.

```
User (platform operator and/or paying customer)
  └── at most one owned Organization (owner)

Organization
  ├── WorkspaceStaffAccount (admin | staff)
  ├── Member
  │     └── GroupMembership (per Group)
  │           └── (future) group-specific field values
  ├── Group (persistent participation context)
  │     ├── GroupMembership (linked Members)
  │     ├── GroupOnlyParticipant
  │     └── owned kiosk configuration (fields not designed)
  └── Event (temporary participation context)
        ├── Event Entry
        └── owned kiosk configuration (fields not designed)

Action (performed)
  └── Action Record
```

---

## Terms to Avoid

| Avoid | Use Instead | Reason |
|-------|-------------|--------|
| "Event" for a historical check-in or action record | Action Record | Event is the real-world temporary/one-time context |
| Activity Record / Attendance Record as the product term | Action Record | Retired candidate names |
| Reservation / Attendee as one generic canonical term | Event Entry | Reservation and Attendee must not be forced to mean the same thing unless a future architecture explicitly separates them |
| Industry-specific product modes | Generic Groups and configuration | Platform is multi-industry |
| "Attendance app" as product identity | Configurable check-in / attendance platform | Product is broader than simple attendance |
| Treating a Group as only a folder of people | Group as a long-lived participation/check-in context that owns its kiosk configuration | Groups configure identification, Actions, kiosk, and outcomes |
| Treating an Event as a Group, or a Group as a one-time Event | Group = persistent/reusable; Event = temporary/one-time | Same participation-context role, different lifecycle |
| Global / workspace kiosk assigned to multiple Groups or Events | Group-owned or Event-owned kiosk configuration | Kiosk presentation and behavior belong to the participation context |
| Member login to the Organization workspace | Kiosk for participants; owner User or WorkspaceStaffAccount for workspace access | Members are tracked people and do not access the workspace |
| Creating accounts.User records for workspace admin/staff | WorkspaceStaffAccount scoped to one Organization | Paying User is the owner only |
| Globally unique staff usernames | Username unique per workspace; staff login includes Workspace ID | Different workspaces may both have username `natsumi` |
| Numeric Organization PK as staff login identifier | Immutable Workspace ID | Internal database keys are not a login UX |
| One customer User managing multiple Organizations | Separate paying User accounts per Organization **workspace** | One workspace may mix many activities; separate accounts are for separate tenants, not each Group/Event |
| Arbitrary dashboard CSS / page-builder | Platform design system and controlled appearance options | Workspace structure stays platform-controlled |
| Generic no-code workflow engine | Predefined Actions, identification methods, and outcomes | Configurability is constrained building blocks |
| Django `is_staff` / platform admin flags as workspace admin/staff | Paying owner User or WorkspaceStaffAccount | Platform operator access ≠ customer workspace roles |
| Merging User and Member because they represent the same person | Separate User and Member records with separate lifecycles | Login access and tracked participation are different concerns |
| Globally mandatory Member email/PIN/photo/reservation code | Contextual validation on the Group or Event that needs the field | Workflows differ; do not force one Member schema on every context |

---

## Terminology Requiring Final Approval

| Term | Options / Notes |
|------|-----------------|
| Kiosk Session | May need refinement once security model is designed |
| Kiosk storage shape | Fields on Group/Event vs separate entity (OPEN-027); ownership is confirmed |
| Organization role capabilities | Role names: owner is the paying User; admin/staff are WorkspaceStaffAccount; permission matrix undecided |
| User ↔ Member explicit linking | Same real person may be both; any explicit link/deduplication mechanism undecided |
| Plan tier names | Basic / Pro / Business are examples only |
| Event sub-concepts | Whether some Events later need separate Reservation and Attendee structures remains undecided |
