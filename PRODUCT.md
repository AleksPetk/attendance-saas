# Product Definition

Detailed product definition for the Configurable Check-In / Attendance SaaS Platform.

For canonical terms, see [TERMINOLOGY.md](./TERMINOLOGY.md). For scope boundaries, see [MVP.md](./MVP.md). For confirmed decisions, see [DECISIONS.md](./DECISIONS.md).

---

## Platform Overview

The platform operates at three conceptual levels:

| Level | Operator | Scope |
|-------|----------|-------|
| **Platform** | Us (platform operators) | Organizations, plans, subscriptions, usage, support, abuse management, suspension, analytics, system management |
| **Organization** | Customer tenant (isolated) | Groups, Members, participants, Events, kiosks, actions, notifications, history, reports, staff, settings, billing |
| **Participants** | End users of an Organization's system | Students, employees, athletes, gym members, visitors, temporary event participants — usually without platform accounts |

An **Organization** is an isolated customer tenant. Billing and subscription state are **separate** from Organization identity. An Organization may exist while trialing, subscribed, cancelled, suspended, or in another future billing state. Billing lifecycle behavior is not defined here.

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
- Kiosks
- Notifications
- Reports
- Staff/admins
- Billing information
- Settings
- Uploaded assets

Tenant isolation is a fundamental architectural and security requirement.

---

## Users and Organizations

A platform **User** account is **not** the same as an **Organization**.

- A User may belong to or manage **more than one** Organization.
- Organizations may have multiple administrators/staff with different permissions (permissions model to be designed later).
- **Participants** (employees, students, athletes, guests, etc.) generally do **not** require platform User accounts.

---

## Members

An Organization may create a reusable, canonical **Member** profile containing the Organization-level data configured for that person.

Example Member profile fields (not necessarily mandatory):

- Name
- Main email
- Phone
- Photo
- Member code
- Other configurable data (implementation undecided)

Which Organization-level Member fields, if any, are universally required remains an open question.

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

Organizations create **Groups** such as:

- Students
- Employees
- Football Team
- Morning Class
- Teachers
- Members
- Warehouse Staff

Groups remain **generic** rather than industry-specific.

Different Groups may have different:

- Participants (Members and/or Group-only participants)
- Configurable fields
- Allowed attendance actions
- Kiosk behavior
- Notification rules

---

## Configurable Member Fields

Different Groups may require different information.

| Group type (example) | Fields |
|---------------------|--------|
| Students | Name, Class, Parent email |
| Employees | Name, Employee ID, Department, Email |
| Simple club | Name only |

The platform should eventually support **configurable/custom fields**. Exact implementation and supported field types are **not decided**. Do not design a full arbitrary form-builder during this stage.

---

## Events and Event Entries

The platform must support **Events** — temporary or one-time check-in/attendance contexts belonging to an Organization.

An Event:

- Can operate without persistent Members or Groups
- May contain **Event Entries**
- Supports reservation-based check-in as **one possible workflow**, not as the definition of Event itself

**Examples:** seminar, appointment event, conference, one-day activity, reservation-based event.

### Event Entry

An **Event Entry** is a temporary record belonging to an Event. Depending on Event configuration, it may represent a reservation, booking, expected attendee, visitor, or another temporary participant record.

It does **not** require:

- A platform User account
- An Organization Member profile
- A Group

Possible Event Entry data may include reservation/reference number, name, contact information, and other Event-specific fields. Event Entries are **not** necessarily reservations.

Do **not** design separate Reservation and Attendee database concepts yet. Whether future architecture will split Event Entries into structures such as Reservation → Attendees remains an open question.

**Example (one possible Event configuration):**

Event: Summer Seminar

Event Entry:

- Reservation number: A1234
- Name: John Smith
- Optional contact information

A participant may identify using a reservation number in this configuration. Other future identification methods may include ticket/reference code, name lookup, QR, or another appropriate method. Which identification methods belong in MVP remains undecided.

Events can define actions such as **Arrived** or **Confirm Attendance**, and notification behavior (e.g., notify the Organization when an Event Entry arrives).

**Future:** Advanced functionality may optionally allow existing Members/Groups with Events, but **standalone Events are a core concept**.

### Event Limits (Subscription)

One-time Events may be naturally limited by plan (example only, not finalized):

- Basic: up to 2 stored Events

When at limit, the product may require deleting an old Event or upgrading.

Before deleting an Event:

- Clearly warn that Event Entries and Event-specific data may be permanently deleted
- Offer export/download before destructive deletion

Do **not** automatically delete old Events merely because they are old. The product may highlight ended/old Events and encourage cleanup.

---

## Actions

Different Groups and Events may use different **Actions**.

| Context (example) | Actions |
|-------------------|---------|
| School | Check In, Check Out |
| Company | Check In, Break Start, Break End, Check Out |
| Gym | Enter, Leave |
| Simple attendance | Present |
| Event | Arrived |

Organizations should be able to configure actions, but the MVP must **not** become a general-purpose workflow engine. Arbitrary conditional programming and unlimited automation logic are **not approved**. The action/state model remains to be designed.

---

## Action Records

Every performed **Action** creates an **Action Record**. Conceptually: **Action → performed → Action Record**.

**Example:**

- Participant: John Smith
- Action: Check In
- Time: 2026-08-17 08:42
- Kiosk: Front Entrance

Historical integrity is important. The system must **not** merely store a participant's current status. Action history must be preserved. Historical records must not be silently overwritten or manipulated in a way that destroys historical integrity. Manual correction and audit behavior remain to be designed.

**Future requirements include:**

- Filtering, search, date ranges
- Per-member, per-group, and Event history
- Reports
- CSV, Excel, and PDF human-readable exports
- Attendance summaries
- Hours calculations where appropriate
- Manual corrections with audit history

Word/DOCX export is **not** currently a priority. Exact historical and audit architecture is not yet designed.

**Important:** Do not use **Event** for Action Records. **Event** is the temporary/one-time check-in context; **Action Record** is the historical record of a performed Action.

---

## Kiosks

A **Kiosk** is a saved/configurable check-in interface — **not** simply an admin page.

Participants must **never** see the Organization administration dashboard when using Kiosk Mode.

Kiosks may run on iPad, iPhone, Android tablet/phone, desktop computer, or browser.

### Identification Patterns (Examples)

| Kiosk type | Input | Actions |
|------------|-------|---------|
| Employee | Username / employee ID + PIN | Check In, Break Start, Break End, Check Out |
| Event | Reservation number (one possible Event identification pattern) | Confirm arrival, notify organization |
| Children's | Large visible names/buttons | Tap name → confirmation dialog → action recorded |

**Potential identification methods over time:** visible name selection/search, PIN, QR code, Member code, reservation/reference number, ticket/reference code, name lookup, and others. For Events, reservation number is one possible pattern, not the definition of all Events.

A Kiosk should eventually have its own secure device/session credentials rather than requiring a full administrator session to remain logged in. Security design is **still undecided**.

### Kiosk Branding

Organizations should have **limited** branding control:

- Primary/accent color
- Optional organization or kiosk logo
- Kiosk title
- Basic background/theme choices
- Light/dark choices (later)

Do **not** design arbitrary CSS customization or a page-builder. The product controls structural UX.

### Kiosk Limits (Subscription)

Distinguish:

- **Configured/saved Kiosk definitions**
- **Simultaneously active kiosk/device sessions**

A subscription may allow several configured kiosks but limit simultaneous active sessions (example only: Basic = 3 active sessions). Example numbers are **not** confirmed pricing.

---

## Organization Administration UI

The Organization admin dashboard is the SaaS application's own designed interface. Organizations should **not** freely redesign its structure.

**Possible later customization:**

- Light/dark/system mode
- A small number of visual themes/templates

Navigation and layout remain controlled by the platform for documentation, support, accessibility, QA, and maintenance consistency.

---

## Notifications

Organizations should eventually configure **notification rules** triggered by actions.

**Example:**

Student Check In → `"{student_name} arrived at school at {time}."`

**Possible recipients:** parent, member, manager, organization administrator, organization, custom email recipient.

**Initial channel:** transactional email.

Normal customers must not need DNS configuration. The platform sends transactional email on their behalf.

Verified customer sending domains may be considered later and could belong to a higher subscription tier. Exact plan placement remains undecided.

The exact notification engine is **not yet designed**.

---

## Subscriptions and Plans

Recurring subscription SaaS product.

**Potential plans:** Basic, Pro, Business — exact names, prices, and limits are **not finalized**.

A free trial around **7 days** is currently only a direction.

**Natural SaaS limits may include:**

- Number of Groups
- Organization Members
- Participants per Group
- Simultaneously active kiosk sessions/devices
- Stored one-time Events
- Notification volume
- Storage/media usage
- Number of admins/staff
- Advanced features

Do **not** artificially disable essential functionality only to create pricing tiers.

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

These examples illustrate flexibility — they are **not** separate product modes or industry-specific modules.
