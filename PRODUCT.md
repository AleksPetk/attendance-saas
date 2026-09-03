# Product Definition

Detailed product definition for the Configurable Check-In / Attendance SaaS Platform.

For canonical terms, see [TERMINOLOGY.md](./TERMINOLOGY.md). For scope boundaries, see [MVP.md](./MVP.md). For confirmed decisions, see [DECISIONS.md](./DECISIONS.md). For conceptual architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Platform Overview

The platform operates at three conceptual levels:

| Level | Operator | Scope |
|-------|----------|-------|
| **Platform** | Us (platform operators) | Organizations, plans, subscriptions, usage, support, abuse management, suspension, analytics, system management |
| **Organization** | Customer tenant (isolated) | Groups, Members, participants, Events, Group/Event-owned kiosk configurations, actions, notifications, history, reports, staff, settings, billing |
| **Participants** | End users of an Organization's system | Students, employees, athletes, gym members, visitors, temporary event participants — usually without platform accounts |

An **Organization** is the customer **workspace**, **tenant**, and **subscription boundary**. It is an isolated customer tenant. The real-world legal form of the customer (company, school, gym, individual business, etc.) does not change the platform model.

One paying customer User owns **one** workspace and may use that workspace for **any mix** of real-world activities — businesses, schools, hobbies, teams, one-time Events, and so on — as **Groups** and **Events** inside that same Organization. Separate User accounts are required only when the same person operates **separate workspaces** (separate tenants / subscriptions), not for each activity type inside one workspace.

Billing and subscription state belong to the Organization workspace and are **separate** from Organization identity. Every newly created normal workspace automatically receives **Business** entitlement for **7 days** (no card, no opt-in). That built-in trial is one-time forever, separate from Stripe/Apple/promotions, and does not start a paid subscription. After the free week, entitlement becomes **Basic** unless a paid Plus or Business subscription was selected during the week (paid billing starts at trial end). An Organization may exist while on Basic, on the built-in Business trial, actively subscribed, scheduled to cancel, in payment-failure grace, or after paid access has ended. Effective entitlement is `Organization.plan`; commercial lifecycle lives in the billing domain.

---

## Multi-Tenancy

The system is fundamentally **multi-tenant**. Each **Organization** is an isolated tenant.

Organization A must **never** access Organization B's:

- Members
- Groups
- Participants
- Events
- Event Entries
- Action Records
- Group-owned and Event-owned kiosk configurations
- Notifications
- Reports
- Staff/admins
- Billing information
- Settings
- Uploaded assets

Tenant isolation is a fundamental architectural and security requirement.

---

## Public Website and Customer Journey

The public browser website is part of the product. It is **not** the Organization workspace.

**Production origins (frozen, DEC-088).** Local development stays on localhost; application origin wiring is not changed in this documentation freeze.

| Origin | Role |
|--------|------|
| `checkstation.app` | Promotional / marketing site: homepage, features, how-it-works, pricing, public Contact, registration entry point, marketing sitemap / `robots.txt` |
| `workspace.checkstation.app` | Owner login, staff login, workspace UI, account/security, subscription/billing, password reset, email verification, Stripe and other account callback returns, and public API at `/api/...` |
| `docs.checkstation.app` | Documentation home, Getting Started, Groups & Members, Kiosk Setup, Billing & Plans, FAQ, Privacy Policy, Terms of Use, Support |
| `status.checkstation.app` | Standalone public Status page and public Status API |

The public API is **`https://workspace.checkstation.app/api/...`** (DEC-095). There is no `api.checkstation.app`. Platform administration intended hostname is `manager.checkstation.app` (not listed in public product navigation; may share Django `/admin/` until reverse-proxy split).

**Public promotional site (unauthenticated) may include:**

- Promotional and SEO pages
- Homepage
- Product explanation
- Pricing
- Registration **entry point** (login, password reset, and email verification are workspace-origin flows)
- Sitemap
- `robots.txt`
- **Documentation** — public Docs website on `docs.checkstation.app` (API-first Content API; footer opens Docs home, Getting Started, Groups & Members, Kiosk Setup, Billing & Plans, FAQ, and Support in a new tab)
- **Contact** — promotional page at `/contact` on `checkstation.app` (same tab). Not a Docs page. Category/subcategory selection suggests canonical FAQ answers before submission. Public Contact API is reusable by future Workspace/mobile/desktop clients.
- **Privacy Policy / Terms of Use** — canonical documents on the Content API; promotional footer opens the Docs legal routes
- **Status** — public system status website at `status.checkstation.app` (API-first Status service; footer links to the Status origin)

After a customer **registers, verifies their email, and authenticates**, they access **their Organization workspace** on the workspace origin. Members do **not** use this workspace. Participants use Kiosks (and similar participant-facing interfaces), not the Organization dashboard.

**Indexing intent (not implemented here):** index `checkstation.app` marketing pages and `docs.checkstation.app` documentation/legal pages. Generally do not index authenticated workspace app pages or the private platform-management origin. Status indexing is a later SEO choice.

Exact public-page content, SEO implementation, and registration/login UX remain later design work. The surfaces listed above are confirmed product direction. **Status is API-first** (DEC-085, production origin DEC-088). **Documentation, Privacy Policy, Terms of Use, Getting Started, Groups & Members, Kiosk Setup, Billing & Plans, FAQ, and Support are API-first** (DEC-086, DEC-087): the public Docs website is one client of the Content API; FAQ entries are structured canonical rows (`content.FaqEntry`), not website-only JavaScript. **Contact lives on the promotional site**, not in Docs. Future in-app Help views use the same FAQ, Status, and Contact APIs directly. Embedded Workspace/mobile Support/Contact screens are not implemented yet.

---

## Users and Organizations

A **User** is a **platform-level login account** — not a WorkspaceStaffAccount and not a **Member**.

Each User account has **one globally unique, normalized (lowercase) email**. That email identifies the paying customer or platform operator. If the same real person needs two Organization workspaces, they use two paying User accounts with two different emails.

### Organization workspace access

- An **Organization** is the internal customer workspace and subscription boundary. It is **not** a required customer-facing business name. Each Organization has **exactly one paying owner User** (`Organization.owner`), a system-generated immutable **Workspace ID**, and may have additional **WorkspaceStaffAccount** admin/staff logins.
- After registration/authentication, the paying customer accesses that Organization as its **owner**. They do not enter a Workspace ID and do not switch Organizations.
- Customer-created workspace admin/staff are **not** `accounts.User` records. They belong to exactly one Organization and cannot move between workspaces. They log in with **Workspace ID + username + password**. Usernames are unique **per workspace only**.
- If the same real person operates **two separate Organization workspaces** (two tenants / subscriptions), they use **separate paying User accounts**. They do **not** need separate paying accounts merely because one workspace contains a school Group, a hobby Group, and a one-time Event.
- Workspace admin/staff may later receive limited permissions such as launching a kiosk or adding Members; the exact capability matrix is to be designed later.

### User vs Member (separate lifecycles)

- **Members** are tracked people inside the Organization. They **do not access the Organization workspace**.
- **Members** and other **Participants** generally do **not** require User or WorkspaceStaffAccount logins.
- The same real-world person may later be both a **WorkspaceStaffAccount** and a **Member** — for example, a teacher who logs in to launch a kiosk and separately has a Member record so their attendance can be tracked.
- Those remain **separate records and lifecycles**. Disabling a WorkspaceStaffAccount must **not** destroy that person’s Member attendance history.
- Any explicit link between a staff account and a Member record, if ever needed, remains a later design decision.

### Platform administration (separate)

Platform operator SaaS admin/staff accounts are `accounts.User` records with Django `is_staff` / `is_superuser`. They are **not** workspace owner/admin/staff roles. Workspace admin/staff are **WorkspaceStaffAccount**.

---

## Members

An Organization may create a reusable **Member** profile for a **tracked person** inside the workspace. A Member is a person profile, **not** a kiosk login or security object. Members **do not access the Organization workspace**. They generally do **not** need a SaaS User login.

Confirmed Member profile fields:

| Field | Requirement |
|-------|-------------|
| Name | Required. Not unique. Duplicate names are allowed. |
| Email | Optional |
| Date of birth | Optional |
| Phone | Optional |
| Address | Optional free-text |
| Photo | Optional |
| Notes | Optional |

The internal database primary key is the Member ID (`#1`, `#2`, `#3` …). It is assigned automatically, immutable, and visible in the workspace as a quiet reference. Do **not** give customers a generated `MBR-XXXXXX` code or another custom Member ID system. Do not use this ID as kiosk identification automatically. Member-level PIN and Member identifier / check-in identifier are **not** Member profile fields; identification and PIN belong to Group/Kiosk participation context (to be cleaned up in the Group slice).

Active Members can be opened and edited. **Archive** is the normal removal path. An archived Member cannot be opened or edited, and is operationally inactive in Groups and kiosks even though existing GroupMembership rows remain. The workspace can **Restore** it (same ID, same profile, same Group attachments) or **Permanently delete** it. Permanent delete is not available on Active Members. After permanent delete, Action Record snapshots remain readable; the live Member link is cleared.

If a Group or Event workflow needs extra information, that requirement is validated **for that participation context**. Do not make email, phone, photo, PIN, reservation code, or similar fields globally mandatory on all Members.

A Member belongs to the Organization and may be attached to **multiple Groups** without duplicating the canonical record.

**Example:**

Member: John Smith

Groups:

- Employees
- Warehouse
- Night Shift

Do **not** duplicate the canonical Member record for every Group.

---

## Group Membership and Group-Specific Data

When a Member is attached to a Group, a **Group Membership** (group-specific context) exists.

Relevant data may default from the canonical Member profile, but Group-specific values may be **overridden** without modifying the Member's canonical data.

**Example:**

| Context | Email |
|---------|-------|
| Canonical Member | abc@gmail.com |
| Employee Group | john@company.com |

Changing the Employee Group email must **not** change the Member's canonical email.

Internal architecture should eventually distinguish:

```
Member → Group Membership → Group-specific field values
```

Database design is not yet approved.

---

## Group-Only Participants

An Organization must be able to add a participant **directly to a Group** without first creating a full reusable Organization Member profile.

**Example:**

Summer Class → Sarah Smith

Sarah can initially exist only in that Group. This supports temporary or lightweight participation.

**Future capabilities (not yet designed):**

- Linking or converting a Group-only participant to a reusable Organization Member without losing historical records
- Duplicate detection and linking

---

## Groups

A **Group** is a **long-lived, reusable participation and check-in context** belonging to an Organization. It is **not** just a folder of people, and it is **not** a temporary Event.

Organizations create **Groups** such as:

- Students
- Employees
- Football Team
- Morning Class
- Teachers
- Members
- Warehouse Staff

Groups remain **generic** rather than industry-specific. One workspace may contain many Groups that represent completely different real-world activities.

A Group defines **participation and activity behavior** for its Members (and Group-only Participants). It **automatically owns its kiosk configuration** — there is no customer-facing “Kiosk enabled” setting. Different Groups in the same Organization may operate completely differently, including kiosk presentation and behavior.

**Group types (confirmed):**

- **Standard Group** — participants belong directly to the Group (existing behavior).
- **Structured Group** — participants belong to **Classes** (`GroupSection` in architecture) inside the Group. Example: School → Class A / Class B → participants.
- Group type is chosen at create time and is **immutable** afterward.
- Structured-only setting: **Require PIN for classes** (optional Class entry PIN; Class PIN stored per Class when used).
- **Structured kiosk** is Card-only: Class cards → (Class PIN if required) → participant cards for that Class → (participant PIN if required) → action → confirmation → **return to Class selection**. Standard Group Card/Input kiosk remains unchanged.
- **Add Class** supports creating an empty Class or a **one-time snapshot import** from an active Standard Group in the same workspace (DEC-067). No live sync; kiosk/settings/history are never copied.

**Group basic settings (confirmed):**

- Group name (visible **Group #ID** from Django PK is automatic, immutable secondary reference)
- Check-in enabled
- Check-out enabled
- Breaks enabled
- Maximum breaks when breaks are enabled (fixed choices 1, 2, or 3)
- Group participation requirements: **Require email**, **Require PIN** (Group-specific participation data, not Member-profile requirements)
- Relevant after-action behavior (only for enabled actions; requires a Ready Group email sender)
- Advanced settings (Group outgoing email sender configuration; Custom SMTP, Gmail App Password, Outlook / Microsoft 365 SMTP, and Yahoo Mail App Password in this slice)

**Group participation (confirmed):** Each operational participant gets an immutable **Group participant code** (`G1-5679`). Group participation emails (up to **3** notification addresses) and PIN are stored on GroupMembership / Group-only participant records. In Structured Groups, participation also references a Class (`section`); the participant code remains Group-scoped and should stay stable if the participant later moves between Classes. Member profile email may prefill participation email #1 on add; editing participation emails does not change the Member profile. When **Require email** is ON, at least one participation email is required (additional addresses are optional). After-action notifications are sent to all configured participation emails. Participation PIN is visible to workspace managers and hidden from participant-facing kiosk lists. **Setup incomplete** is derived when requirements are ON but operational participants lack data (Structured: across active Classes only); configuration save is still allowed; real kiosk/attendance operations are blocked until complete or requirements are turned off. Disabling requirements retains stored values.

**Not part of Group basic settings:** photo/identifier Member-profile requirement matrix. **Kiosk Settings** (separate from Group and Kiosk Design) controls identification mode, card/input configuration, and kiosk exit code. Group `require_email` / `require_pin` define availability; kiosk chooses usage. The kiosk shell always has Header/Main/Footer; Builder owns visual appearance and builder-only fake density testing. Launch is blocked while Group setup or Kiosk Settings are incomplete/invalid; the Kiosk Builder remains available.

**Group lifecycle (confirmed):** Active → Archive → Restore or Permanent Delete. Archived Groups are operationally inactive. Permanent delete preserves ActionRecord snapshots.

Different Groups may have different:

- Participants (Members and/or Group-only participants)
- Configurable fields
- Identification methods (examples: PIN only; Member ID + PIN; Member ID only; visible member selection)
- Allowed predefined Actions (examples: Check In, Check Out, Break Start, Break End)
- Owned kiosk configuration (presentation and behavior)
- Notification / post-action outcomes

Identification methods and Actions are **predefined building blocks** the Organization selects per Group. Exact field types, which methods ship in MVP, and the Action/state implementation remain undesigned.

---

## Configurable Member Fields

Different Groups may require different information.

| Group type (example) | Fields |
|---------------------|--------|
| Students | Name, Class, Parent email |
| Employees | Name, Employee ID, Department, Email |
| Simple club | Name only |

The platform should eventually support **configurable/custom fields**. Exact implementation and supported field types are **not decided**. Do not design a full arbitrary form-builder during this stage. Field requirements are **contextual** to the Group (or Event): a Students Group may require photo and name; a simple club Group may require name only. Do not make those fields globally mandatory on every Member.

---

## Events and Event Entries

The platform must support **Events** — **temporary or one-time** check-in/attendance contexts belonging to an Organization.

**Group** and **Event** are similar as participation contexts (identification, Actions, owned kiosk configuration, outcomes). Their **lifecycle** differs:

- **Group** = persistent / reusable
- **Event** = temporary / one-time

An Event:

- Can operate without persistent Members or Groups
- **Owns its own kiosk configuration** (not a workspace-level kiosk reused from a Group)
- May contain **Event Entries**
- Supports reservation-based check-in as **one possible workflow**, not as the definition of Event itself

**Examples:** seminar, appointment event, conference, one-day activity, reservation-based event.

### Event Entry

An **Event Entry** is a temporary record belonging to an Event. Depending on Event configuration, it may represent a reservation, booking, expected attendee, visitor, or another temporary participant record.

It does **not** require:

- A platform User account
- An Organization Member profile
- A Group

Event Entries may represent **temporary people** without creating reusable Members. **Action Records** for those people still remain (historical integrity). Creating an Event Entry must not force Member creation.

Possible Event Entry data may include reservation/reference number, name, contact information, and other Event-specific fields. Event Entries are **not** necessarily reservations. Required fields are **contextual** to that Event’s workflow (for example a reservation number), not globally mandatory Member fields.

Do **not** design separate Reservation and Attendee database concepts yet. Whether future architecture will split Event Entries into structures such as Reservation → Attendees remains an open question.

**Example (one possible Event configuration):**

Event: Summer Seminar

Event Entry:

- Reservation number: A1234
- Name: John Smith
- Optional contact information

A participant may identify using a **configured identification field** such as a reservation number. Reservation-number identification is **one possible Event workflow**, not the definition of Event itself. Other future identification methods may include ticket/reference code, name lookup, QR, or another appropriate method. Which identification methods belong in MVP remains undecided.

Events can define actions such as **Arrived** or **Confirm Attendance**, and notification behavior (e.g., notify the Organization when an Event Entry arrives).

**Future:** Advanced functionality may optionally allow existing Members/Groups with Events, but **standalone Events are a core concept**.

### Event Limits (Subscription)

**V1 Group/Member/staff limits are frozen** in [Subscriptions and Plans](#subscriptions-and-plans). **Event**-specific plan limits (how many Events vs Groups) remain **not decided** and may later differ from Group axes. Do not invent Event quota numbers here.

When at an Event limit (once defined), the product may require deleting an old Event or upgrading.

Before deleting an Event:

- Clearly warn that Event Entries and Event-specific data may be permanently deleted
- Offer export/download before destructive deletion

Do **not** automatically delete old Events merely because they are old. The product may highlight ended/old Events and encourage cleanup.

---

## Actions

Different Groups and Events may use different **predefined Actions**.

| Context (example) | Actions |
|-------------------|---------|
| School | Check In, Check Out |
| Company | Check In, Break Start, Break End, Check Out |
| Gym | Enter, Leave |
| Simple attendance | Present |
| Event | Arrived |

**Confirmed product behavior:**

- Organizations configure which predefined Actions a Group or Event allows.
- Repeated Actions must be possible — for example multiple Break Start / Break End cycles in one day.
- Simple **preset / automatic** attendance behavior may exist — for example automatic 08:00 Check In, with the Member only recording Check Out at a kiosk.
- Configurability uses **predefined building blocks and controlled options**. The product must **not** become a generic no-code workflow engine. Arbitrary conditional programming and unlimited automation logic are **not approved**.

The Action/state implementation, preset engine, and which presets belong in MVP remain to be designed.

---

## Action Records

Every performed **Action** creates an **Action Record**. Conceptually: **Action → performed → Action Record**.

**Example:**

- Participant: John Smith
- Action: Check In
- Time: 2026-08-17 08:42
- Kiosk: Front Entrance
- Created via: kiosk (example)

Historical integrity is important. The system must **not** merely store a participant's current status. Action history must be preserved. Historical records must not be silently overwritten or manipulated in a way that destroys historical integrity. Manual correction and audit behavior remain to be designed.

**Confirmed product behavior:**

- Action Records must preserve **how** they were created. Sources include at least: **kiosk**, **staff/admin**, and **automatic/preset**. Exact source/context fields are undesigned.
- History must remain **historically accurate** when later Group, Kiosk, or Action **configuration changes**. Changing a Group’s allowed Actions or a Kiosk’s identification method must not rewrite or falsify existing Action Records.
- Workspace **History** includes an **Activity Log** (raw Action Records) and an **Attendance Report** (one Group at a time; participant × day; Structured Groups also show historical Class and use participant × Class × day grain; columns from historical Action Records; archived and deleted Groups remain selectable via immutable `source_group_id`). CSV / Excel / PDF export downloads the currently visible Attendance Report when the workspace plan entitles exports (**Basic:** no CSV/Excel/PDF export; **Plus** / **Business:** full export — see [Subscriptions and Plans](#subscriptions-and-plans)).

**Future requirements include:**

- Broader filtering, search, and cross-Group report matrices
- Per-member and Event history views
- Attendance summaries
- Hours calculations where appropriate
- Manual corrections with audit history

CSV / Excel / PDF exports of the visible Attendance Report are **implemented product capabilities** and are **plan-gated** under V1 plans (not Post-MVP ideas). Word/DOCX export is **not** currently a priority. Exact historical and audit architecture is not yet designed.

**Important:** Do not use **Event** for Action Records. **Event** is the temporary/one-time check-in context; **Action Record** is the historical record of a performed Action.

---

## Kiosks

A **Kiosk** is the participant-facing **browser** check-in interface for a **Group** or an **Event**. It is **not** the Organization workspace, not an admin page, and **not** a global workspace resource that is assigned to — or switched between — arbitrary Groups and Events.

### Ownership and lifecycle

- Each **Group** owns its own kiosk configuration.
- Each **Event** owns its own kiosk configuration.
- Different Groups and Events in the same workspace may have **completely different** kiosk presentation and behavior.
- For the simple **initial product direction**, each Group and each Event has **one** owned kiosk configuration. Multiple kiosk variants per Group or Event remain a **future decision**, not an MVP requirement.
- Kiosk Mode is the operational, participant-facing state of that owned configuration. It must **never** expose the Organization administration dashboard.

Do **not** design a workspace-level kiosk multiplexer that randomly (or even manually) points one saved kiosk at different Groups or Events.

**Examples** (not an MVP feature checklist):

| Participation context | Example kiosk |
|-----------------------|---------------|
| Students Group | Kids-friendly; visible names/photos; simple check-in |
| Staff Group | Minimal; ID + PIN; check-in / break / check-out |
| Training Group | Sport-style kiosk with its own identification and Actions |
| Reservation Event | Temporary kiosk asking for a reservation number |

Kiosks may run in a browser on iPad, iPhone, Android tablet/phone, or desktop computer.

Kiosk **database fields**, how Kiosk Mode is launched, and the device/session security model are **not designed here**.

### Kiosk Settings (Group — confirmed implementation)

Each Group has **Kiosk Settings** (behavioral) separate from **Kiosk Design** (visual). Responsibilities:

| Layer | Owns |
|-------|------|
| Group | participation email/PIN availability, actions, after-action behavior, Advanced email sender |
| Kiosk Settings | Standard: Card vs Input. Structured: fixed Class → Participant card flow (no Input). Display/input fields, **attendance reset** (Daily/Rolling cycle boundaries, manual Reset now), **confirmation screen** (preset template, per-action messages, return delay), hashed kiosk exit code. Class PINs are managed per Class, not in Kiosk Settings. |
| Kiosk Design Editor | appearance of always-on Header/Main/Footer shell |

**Card mode:** operational participants as selectable cards; optional name, group participant code, email display; optional PIN after card tap. **Structured Groups** prepend Class cards (and optional Class PIN) and scope participant cards to the selected Class; after confirmation they return to Class selection.

**Input mode (Standard Groups only):** one field = group participant code only; two fields = code + name, email, or PIN (when Group supports them).

**Launch:** blocked until Group setup complete, settings valid, exit code configured. **Exit:** group-specific exit code (not owner password). **Attendance reset:** controls when live kiosk state treats participants as starting a fresh operational cycle. Modes: **Daily** (Group-wide local-time boundary; default 00:00) or **Rolling** (participant-specific window from cycle-start check-in). **Reset now** creates an immediate Group-wide manual boundary without changing scheduled settings or deleting ActionRecords. Reset affects live action availability only — History and reports remain complete. **Confirmation screen:** after a successful action, participants see a preset-styled confirmation (not free-form Builder design) with action-specific message text, optional `{name}` / `{time}` (24-hour) / `{group}` variables, and a fixed return delay of 1, 3, or 5 seconds (default 3). The delay applies only to how long the confirmation stays visible — not API/action execution. Main/kiosk background remains behind a readable confirmation surface; accent may derive safely from kiosk design. **Builder canvas** is the design preview (fake participants for Card density testing only; Minimize for unobstructed inspection). There is no separate Preview page. **Launch Kiosk** is the only operational kiosk.

Deprecated Group kiosk columns may remain in DB temporarily; new configuration uses `KioskSettings`.

### Identification Patterns (Examples)

These are **example flows**, not a confirmed MVP checklist. Each flow belongs to a Group’s or Event’s **owned** kiosk configuration:

| Example flow | Input | Actions |
|--------------|-------|---------|
| Visible-name selection | Large visible names/buttons; confirm | Action recorded |
| Secure PIN only | PIN with **no names shown** | Allowed Group Actions |
| Member ID + PIN | Member ID then PIN | Check In, Break Start, Break End, Check Out |
| Member ID only | Member identifier | Allowed Group Actions |
| Event / reservation | Reservation/reference number (one possible Event identification pattern) | Confirm arrival; optional notify |

**Potential identification methods over time:** visible name selection/search, PIN, Member ID, Member ID + PIN, QR code, Member code, reservation/reference number, ticket/reference code, name lookup, and others. For Events, reservation number is one possible pattern, not the definition of all Events. Which methods belong in MVP remains undecided.

A Group or Event kiosk should eventually be operable with secure device/session credentials rather than requiring a full administrator session to remain logged in. Security design is **still undecided**.

### Kiosk Branding

Kiosks may allow **more customer-facing branding** than the Organization workspace, still using **controlled options**, not arbitrary CSS or a page-builder:

- Optional organization or kiosk logo
- Selected colors (for example primary/accent)
- Prepared presentation options
- Kiosk title
- Basic background/theme choices
- Light/dark choices (later)

The product still controls structural UX.

### Kiosk Limits (Subscription)

Do **not** count independently assigned workspace-level kiosk definitions as the primary plan axis. Kiosk configuration is owned by Groups and Events.

Plan design may later distinguish, among other things:

- Number of **persistent Groups** (each with its owned kiosk configuration)
- Number of **Events** (each with its owned kiosk configuration; possibly a smaller active-Event allowance)
- **Simultaneously active kiosk/device sessions** (how many devices are running Kiosk Mode at once)

Exact limit numbers and which of these axes ship are **not decided**. Example numbers are **not** confirmed pricing.

Multiple kiosk variants per Group or Event are **not** an MVP requirement and must not be assumed in limit design yet.

---

## Organization Workspace UI

The Organization workspace (admin dashboard) is the SaaS application’s own designed interface. It uses the **platform design system and prepared themes**.

Customers may choose **controlled appearance options**. They **cannot** arbitrarily redesign the dashboard structure, navigation, or layout.

**Possible later customization (controlled):**

- Light/dark/system mode
- A small number of visual themes/templates from the prepared design system

Navigation and layout remain controlled by the platform for documentation, support, accessibility, QA, and maintenance consistency. This is stricter than Kiosk branding: kiosks may show more customer-facing logo/color/presentation options, still within prepared choices.

---

## Notifications

After an Action is performed, configured **outcomes** may include:

- Success message only
- Email / notification to relevant recipients
- Other **predefined** notification behavior

Organizations should eventually configure **notification rules** triggered by actions.

**Example:**

Student Check In → `"{student_name} arrived at school at {time}."`

**Possible recipients:** parent, member, manager, organization administrator, organization, custom email recipient.

**Initial channel:** transactional email.

**Two separate email systems:**

1. **Platform account email** (Resend) — Check Station account verification, password reset, and similar platform mail. Works without customer DNS.
2. **Group attendance email** — after-action messages for a Group use that Group’s configured **email sender**. Supported providers: **Custom SMTP**, **Gmail (Google App Password)**, **Outlook / Microsoft 365** (SMTP authentication), and **Yahoo Mail** (Yahoo App Password). Sender credentials are encrypted at rest. Saving credentials alone is not enough; the workspace user must successfully send a test email before the sender is **Ready**. After-action toggles stay disabled until Ready. Enabling any after-action email automatically turns on Group **Require email**; turning after-action emails off later does **not** automatically turn Require email off. Attendance ActionRecords succeed even if email delivery fails. Each participation may have up to **3** notification emails; all configured addresses receive the same after-action message via separate private deliveries. Optional **Forward Emails** (up to 3 Group-level addresses) also receive private copies. Participant + forward addresses are merged into one unique recipient set (duplicates sent once). Recipients never see each other’s addresses. Forward Emails do not replace participation recipients, do not bypass Require email, and do not change sender Ready/verification.

**Gmail (App Password):** guided provider — Gmail address + App Password + optional From name. Technical SMTP host/port/security are applied internally (`smtp.gmail.com`, SSL/TLS port 465). Normal Google account passwords are never accepted. Google OAuth is **not** implemented yet.

**Outlook / Microsoft 365:** guided SMTP AUTH provider — Microsoft email + password/app password + optional From name. Technical SMTP host/port/security are applied internally (`smtp.office365.com` or `smtp-mail.outlook.com` for consumer domains, STARTTLS port 587). Sender email equals the connected Microsoft mailbox (no free From alias). This path is mainly for **Microsoft 365 business/work** mailboxes where an administrator can enable Authenticated SMTP. Personal Outlook/Hotmail compatibility is **not** guaranteed; an app password alone does not restore SMTP AUTH when it is disabled. Microsoft OAuth / Graph API are **not** implemented yet.

**Yahoo Mail:** guided App Password provider — Yahoo email + App Password + optional From name. Technical SMTP is applied internally (`smtp.mail.yahoo.com`, SSL/TLS port 465). Normal Yahoo account passwords are never accepted. Email addresses are validated generically (not restricted to `@yahoo.com`). Yahoo OAuth is **not** implemented.

**MVP provider list (complete):** Custom SMTP, Gmail, Outlook / Microsoft 365, Yahoo Mail. No additional dedicated provider integrations are planned for the current MVP. OAuth-based variants remain undesigned. **Plan placement** for Group email features is frozen in [Subscriptions and Plans](#subscriptions-and-plans) (Basic allows Custom SMTP / Gmail / Outlook / Yahoo and after-action / participation emails; Group Forward Emails are Plus/Business).

The exact broader notification engine (non-email channels, OAuth providers, arbitrary workflow scripting) remains undesigned. Group-level Forward Emails (max 3 private copies) are implemented as a fixed building block. Outcomes must remain **predefined building blocks**, not arbitrary workflow scripting.

---

## Subscriptions and Plans

Recurring subscription SaaS product. **Subscriptions belong to the Organization workspace**, not to individual Members. The Organization is the **subscription boundary**.

**Canonical V1 plan names (use exactly):** **Basic**, **Plus**, **Business**. Do **not** use Free, Pro, or Enterprise for V1 tiers.

Every newly created **normal** workspace automatically receives **Business** for **7 days** at creation (DEC-093). No card, no activation choice, and no “use later.” CheckStation-managed workspaces are ineligible. Workspaces that already existed when this trial shipped are permanently ineligible. The first-time workspace tutorial only **informs** the owner that Business is already included; it does not activate the trial.

**V1 plan names, limits, ads policy, non-destructive downgrade semantics, Owner Account area structure, entitlement architecture, permanent USD prices, monthly/yearly intervals, automatic 7-day built-in Business trial, upgrade/downgrade/cancellation timing, and payment-failure grace are frozen** (see below and [DECISIONS.md](./DECISIONS.md) DEC-072–082, DEC-093). Stripe Checkout/webhooks/Customer Portal **architecture and Account UI are implemented** (provider boundary + owner APIs); live Stripe account/credentials and Apple billing remain open (OPEN-011 narrowed, OPEN-015).

Do **not** treat kiosks as a separately assigned workspace resource for plan limits. Do **not** artificially disable essential operational functionality only to invent pricing tiers beyond the frozen matrix.

### Permanent V1 prices (USD)

| Plan | Monthly | Yearly |
|------|---------|--------|
| **Basic** | Free forever (ads) | Free forever (ads) |
| **Plus** | USD $9.99 | USD $99.99 |
| **Business** | USD $14.99 | USD $149.99 |

Yearly list pricing provides approximately two months of savings compared with paying monthly for 12 months. Monthly and yearly amounts are explicit catalog values, not a multiplication rule. Both **monthly** and **yearly** are V1 billing intervals for paid plans, from launch. V1 currency is **USD**. The application must **not** invent its own proration arithmetic; the payment provider calculates amounts.

Promotions are eligibility-based (DEC-091): New/Basic OFF/NORMAL/BIG acquisition; Plus Monthly annual switches (Plus Yearly 30% / Business Yearly 30%); Business Monthly → Business Yearly 30%; Plus Yearly and Business Yearly have no promotion. Permanent catalog prices above are never mutated. Clients read audience-aware promotion state from the billing catalog API.

### V1 plan matrix

| Capability | Basic | Plus | Business |
|------------|-------|------|----------|
| Price posture | Free forever | Paid | Paid |
| Ads | Yes (see Basic ads policy) | No | No |
| Active Standard Groups | 2 | 10 | 30 |
| Active Structured Groups | Locked (0) | Locked (0) | 15 |
| Archived Groups | 2 | 10 | 50 total (current Group archive model) |
| Members | 10 | 50 | 300 |
| Participants per Standard Group | 10 | 50 | 150 |
| Classes per Structured Group | — | — | 30 |
| Participants per Class | — | — | 150 |
| Workspace Admin accounts | 0 (Staff page locked) | 2 | 5 |
| Workspace Staff accounts | 0 (Staff page locked) | 5 | 25 |
| Owner as only workspace manager | Yes | No | No |
| Kiosk Builder | Full | Full | Full |
| Kiosk templates | All Card/Input templates | All Card/Input templates | All Card/Input templates |
| Kiosk Settings | Full | Full | Full |
| Activity Log / History | Full | Full | Full |
| Attendance Reports | Full | Full | Full |
| CSV / Excel / PDF export | No | Full | Full |
| Custom SMTP / Gmail / Outlook / Yahoo | Allowed | Full | Full |
| After-action email | Allowed | Full | Full |
| Participation notification emails | Allowed | Full | Full |
| Group Forward Emails | Locked | Full | Full |
| Staff Group assignments | N/A (no staff) | Available | Available |
| Standard → Structured Class snapshot import | Locked | Locked | Enabled |
| Attendance Reset / normal Kiosk Settings | Available | Available | Available |

**Plus** effectively unlocks all current Standard Group features except Structured Groups.

**Business** includes all Plus features plus Structured Groups and the full current product feature set for those capabilities.

### Limit semantics

- **Active** and **archived** limits are separate where the matrix lists both.
- Archived resources do **not** consume active limits.
- Plan restrictions must be enforced **server-side**, not UI-only.
- **Role authorization** and **plan entitlement** are separate checks. Where both apply, the actor must pass **both**.

Example: a Workspace Admin may have role permission to create a Structured Group, but **Plus** does not include Structured Groups → the operation is denied by the entitlement layer.

### Downgrade rule

**Downgrading never automatically deletes customer data.**

If a workspace exceeds the destination plan’s limits after **effective** downgrade (when `Organization.plan` actually changes):

- existing data remains
- existing records remain readable/operational where safe
- creation, reactivation, or configuration that would **increase** over-limit usage is blocked
- UI clearly shows over-limit state
- the customer can reduce usage or upgrade

Do **not** silently archive or delete data to force compliance.

Plan-lock / slot-selection runs only when the **effective** entitlement plan changes. Scheduling a future downgrade or cancellation must **not** lock the workspace early.

### Billing lifecycle (frozen commercial rules)

`Organization.plan` is the **current effective entitlement plan**. Billing subscription state is the **commercial/payment lifecycle**. They must stay separate until an effective transition runs.

**Built-in 7-day Business trial** (DEC-093; replaces the former card-required Business trial):

- Every new normal workspace automatically receives **Business** entitlement for **7 days** at creation
- No card, no Stripe/Apple trial grant, no promotion/coupon, no opt-in, and no “use later”
- One time forever per workspace; billing, cancellation, and provider changes never restore eligibility
- Existing workspaces at cutover are permanently ineligible (consumed, never granted)
- CheckStation-managed workspaces are ineligible
- Entitlement changes go only through `Organization.plan` + `apply_effective_plan()`
- At trial end: no paid subscription → **Basic**; Plus selected during the week → keep Business until trial end, then **Plus**; Business selected during the week → keep Business, then paid Business starts at trial end
- Purchasing during the week must not shorten the free week; paid Stripe/Apple billing is deferred until trial end
- Commercial checkout is allowed while entitlement is Business from this trial (`Organization.plan == basic` is not the checkout gate)
- Expiry is lazy/self-healing on entitlement/billing reads plus the `expire_builtin_trials` command; it does not depend on Stripe webhooks

**Paid upgrades are immediate** (including yearly Plus → yearly Business):

- Customer receives the higher entitlement immediately after a successful billing adjustment
- Unused paid value is credited and the customer pays the remaining prorated difference **as calculated by the provider**
- The existing billing-cycle anchor is preserved where the provider supports it
- Do **not** charge an entirely new full Business year on top of already-paid Plus time
- Before confirming an upgrade, Subscription UI shows a provider-calculated immediate charge from the upgrade preview API (do not fabricate amounts)

**Paid downgrades are scheduled for period end** (example: Business → Plus):

- Request now; current paid plan remains fully available until the current paid period ends
- No plan locks at request time
- Before the effective date, the Owner may **cancel the scheduled downgrade**; Business continues on the existing subscription/billing cycle with no new Checkout or immediate charge
- At period end (if not reversed), billing applies the destination plan to `Organization.plan`, and **then** existing downgrade/plan-lock behavior runs

**Cancellation is scheduled for period end** (paid) or the provider’s delayed first paid period end:

- Customer may cancel now; current access remains through the paid period or deferred paid start
- Cancellation is **not** account, workspace, or data deletion (DEC-052)
- Before the effective end, the Owner may **resume** the subscription: cancel-at-period-end is cleared on the existing Stripe subscription, pending Basic transition is cleared, the billing cycle is preserved, and no new Checkout or immediate resubscribe charge is required
- The same resume path applies to a canceled **deferred paid start** still waiting for first invoice (provider `trialing` / `trial_ends_at` unchanged; conversion to the selected paid plan is restored). This is not the built-in 7-day Business trial.
- At paid period end (if not resumed), paid access ends and the workspace transitions to **Basic** unless the built-in trial is still active; existing Basic entitlement/plan-lock behavior handles over-limit data non-destructively
- Canceling a deferred paid start does **not** shorten the built-in free week; if no paid plan remains at built-in trial end, the workspace becomes **Basic**

**Payment failure grace:** the first failed recurring payment does **not** immediately downgrade. Current paid entitlement is preserved for **3 days**. A warning email is sent **once per day** during grace via the platform email path (`send_billing_payment_warnings` management command; schedule daily in deployment). If payment recovers, failure/grace state is cleared. If billing remains unresolved after the final provider outcome/grace handling, paid access ends and the workspace transitions to **Basic**. Stripe webhooks coordinate with this internal grace state; the app does not implement an independent payment retry engine.

**Billing interval changes** (monthly ↔ yearly): intervals are first-class V1 values. Conversion/proration **execution** is deferred to provider integration (OPEN-011).

**Purchase sources:** `none` (Basic / no paid relationship), `stripe`, `apple`. Basic/free workspaces have no paid purchase source. Account Subscription/Billing UI must later respect the source (Apple-managed subscriptions go to Apple for applicable management).

Platform-admin changes to `Organization.plan` for **CheckStation Accounts** are **manual entitlement operations**, not paid transactions, and must use `apply_effective_plan()`. Normal customer workspaces with a live paid subscription are not raw-edited from Organization admin.

### Basic ads policy

**Basic** may show ads in these **web workspace** placements:

- Dashboard banner
- Groups banner
- before kiosk launch (interstitial)
- after kiosk exit (interstitial)
- when leaving Kiosk Builder (interstitial)

**Ads are not allowed during live participant kiosk operation.** That includes the participant flow, action chooser, loading/sending screens, confirmation, and the shared live kiosk renderer.

**Plus** and **Business** have **no ads**.

A platform-operator **global kill switch** can hide all advertising without changing workspace plans or subscriptions.

The current web implementation uses a **development mock provider**. A real ad provider is deferred until deployment. Provider or render failure must never block Dashboard, Groups, kiosk launch, kiosk exit, or Kiosk Builder navigation.

### Owner Account area (architecture)

The Owner Account area is organized into three top-level sections/pages:

1. **Security** — primary/login email, backup email, password, optional Owner TOTP 2FA, Danger Zone / permanent account deletion. Always available to the owner.
2. **Subscription** — current plan, plan status, limits/usage, upgrade/downgrade/cancellation, renewal, purchase-source-aware management (Stripe/web, Apple, etc.). Owner Checkout and plan-change actions call billing APIs; browser return URLs are UX only. Hidden when the workspace is a CheckStation-managed account.
3. **Billing** — Stripe Customer Portal for invoices/payment method when Stripe-managed; lightweight summary otherwise; purchase-source awareness. Hidden when the workspace is a CheckStation-managed account.

Direct `/account/subscription` and `/account/billing` routes redirect to Security when those capabilities are off. Backend workspace capabilities include `account_mode` (`normal` | `checkstation`), `workspace_status`, `can_view_billing`, and `can_manage_subscription`. Do not show customers technical “CheckStation Account flag ON” copy.

### Purchase source

Subscription ownership may come from different **purchase sources** (`none`, `stripe`, `apple`). Account UI and business logic respect the purchase source (for example, Apple-managed subscriptions do not open Stripe Customer Portal). Live Stripe credentials are not configured in-repo; Apple IAP execution remains open.

### Entitlement layer

Plan checks go through the **internal entitlement / usage system** (`organizations.entitlements`). Commercial billing state lives in the **billing** domain and **feeds** entitlement by changing `Organization.plan` through a canonical effective plan transition.

The entitlement layer answers:

- What plan is this workspace on?
- What features are enabled?
- What is the limit for this resource?
- What is current usage?
- May this operation proceed?
- Is the workspace currently over limit?

Plan checks must **not** be scattered through Stripe-specific code. Stripe (and other sources) update billing subscription state that **feeds** this entitlement system.

---

## Storage and Media

Do **not** assume Action Record history is the primary storage problem. Database history rows are generally much smaller than uploaded media.

**Storage quotas should mainly protect against:**

- Member photos
- Logos
- Kiosk branding assets
- Future attachments
- Abuse/excessive uploads

Attendance/action history retention should be designed separately and carefully. Do **not** design the product around forcing users to frequently delete important Action Record history because of small storage quotas.

### Image/Media Optimization

Optional Member photos and Organization/Kiosk logos should be automatically optimized. Large original phone images should not be stored blindly if used only as small profile/kiosk images.

**Future implementation should consider:**

- Resizing, compression, removing unnecessary metadata
- Sensible maximum dimensions
- Modern image formats where appropriate
- Thumbnails/variants if needed

If storage quotas are implemented, count **optimized stored assets** toward quota, not original upload file size. Exact dimensions/formats are undecided.

---

## Platform Administration (Future)

Operated by platform team. Future capabilities include managing Organizations, plans, subscriptions, usage, support, abuse, account suspension, platform analytics, and system management. Detailed scope is not yet defined.

---

## Customer Examples

Possible customers include schools, after-school programs, companies, offices, gyms, sports clubs, childcare organizations, training centers, events, community organizations, and any organization needing configurable check-in or attendance workflows.

These examples illustrate flexibility — they are **not** separate product modes or industry-specific modules. One Organization workspace may contain any mix of them at once.
