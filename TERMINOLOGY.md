# Terminology

Canonical and provisional product terms for the Configurable Check-In / Attendance SaaS Platform.

Terms marked **(provisional)** require final approval. Terms marked **(confirmed)** are established in current product planning.

---

## Platform Level

### Platform **(confirmed)**

The SaaS system operated by the platform team. Encompasses all Organizations, infrastructure, billing, and platform administration.

### User **(confirmed)**

A **human login account** for people who authenticate to the SaaS application. A **customer User** accesses **exactly one** Organization **workspace** through **OrganizationMembership**. A User is **not** the same as an Organization workspace, a Member, or a Participant.

A customer User does not switch Organizations in one login. If the same real person manages two separate customer businesses/workspaces, they use separate User accounts. The same real-world person may also be a Member in an Organization, but User and Member remain separate records and lifecycles.

Platform operator accounts also use the User model; `is_staff` / `is_superuser` are global platform-admin flags, separate from customer Organization membership. See [SECURITY.md](./SECURITY.md).

### OrganizationMembership **(confirmed)**

The relationship/role entity linking one **customer User** to one **Organization**. Expresses that a User belongs to or manages that Organization. Carries the User's **role** within that Organization.

A customer User may have **at most one active OrganizationMembership**. Customer Users do not switch Organizations in one login.

Architecture entity name: **OrganizationMembership**. See [ARCHITECTURE.md](./ARCHITECTURE.md).

### Organization role **(confirmed names; capabilities provisional)**

The role assigned on an OrganizationMembership within an Organization. Fixed MVP role names:

- **owner**
- **admin**
- **staff**

Exact capability and permission differences between these roles remain **undecided**. This glossary approves the role names, not a full permission matrix.

People who manage an Organization through the administration dashboard do so as Users with an OrganizationMembership in that Organization.

### Plan **(confirmed concept, details provisional)**

A subscription tier (e.g., Basic, Pro, Business) defining feature access and usage limits. Exact names, prices, and limits are **not finalized**.

### Subscription **(confirmed concept, details provisional)**

An Organization workspace's billing relationship with the Platform. Tied to a Plan. Belongs to the **Organization**, not to Members. Implementation details undecided. Subscription/billing status is separate from Organization identity.

---

## Organization Level

### Organization **(confirmed)**

The customer **workspace**, **tenant**, and **subscription owner** on the Platform. An Organization configures and operates its own check-in/attendance system.

The real-world legal form of the customer (company, school, gym, individual business, etc.) does not change the platform model. Each Organization has **exactly one primary owner** User and may have additional admin/staff Users via OrganizationMembership.

An Organization may be in trial, actively subscribed, cancelled, suspended, or another billing state. Billing/subscription status is **separate** from the identity of the Organization itself. An Organization is not defined by currently paying.

Tenant isolation remains fundamental: all Organization data is strictly separated from other Organizations.

### Member **(confirmed)**

A reusable canonical **tracked person** profile belonging to an Organization workspace. It contains the Organization-level data configured for that person. A Member generally does **not** require a User login and may be attached to multiple Groups without duplicating the canonical Member record.

The same real-world person may also be a staff User in the same Organization, but Member and User remain separate records and lifecycles. Disabling staff User access must not destroy Member attendance history.

Possible data may include name, email, phone, photo, member code, and other Organization-configured fields. These examples are **not** necessarily mandatory fields.

Group-specific overrides belong to **Group Membership**, not to the canonical Member record.

### Group **(confirmed)**

An Organization-defined collection/context for participants with its own configurable fields, allowed actions, kiosk behavior, and notification rules. Remains generic (e.g., Students, Employees, Morning Class).

### Group Membership **(confirmed)**

The relationship attaching a Member to a Group. Holds group-specific context and may override canonical Member field values without modifying the Member's canonical data.

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

A temporary or one-time check-in/attendance context belonging to an Organization. It can operate without persistent Members or Groups. An Event may contain Event Entries.

**Examples:** seminar, conference, appointment event, one-day activity, reservation-based event.

Reservation-number identification is **one possible Event workflow**, not the definition of Event itself. Other future identification methods may include ticket/reference code, name lookup, QR, or another appropriate method. Exact Event identification methods and MVP scope remain subject to later design.

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

Possible data may include reservation/reference number, name, contact information, and other Event-specific fields. These examples are not a final data model.

**Important:** Do not treat Reservation and Attendee as one canonical term, and do not define the final database model for reservations versus individual attendees yet. In the future, some Events may need a more detailed structure such as one Reservation containing multiple Attendees. **Event Entry** is currently the generic product term so Reservation and Attendee are not forced to mean the same thing.

---

## Actions and History

### Action **(confirmed)**

A configurable operation a participant can perform (e.g., Check In, Check Out, Break Start, Enter, Leave, Present, Arrived). Different Groups and Events may define different Actions. Not a general-purpose workflow step.

Conceptually: **Action → performed → Action Record**.

### Action Record **(confirmed)**

The historical record created when an Action is performed.

**Example:**

- Participant: John Smith
- Action: Check In
- Time: 2026-08-17 08:42
- Kiosk: Front Entrance

Do **not** use Event for this historical concept. The full audit/correction architecture is not yet defined.

Earlier candidate names **Activity Record** and **Attendance Record** are retired; use **Action Record**.

---

## Kiosks and Interfaces

### Kiosk **(confirmed)**

A saved, configurable participant-facing check-in interface. Not an admin page. Runs on tablets, phones, desktops, or browsers. Has its own identification patterns, allowed actions, and limited branding.

### Kiosk Mode **(confirmed)**

The participant-facing operational state of a Kiosk. Must never expose the Organization administration dashboard.

### Kiosk Session **(provisional)**

An active device/session operating a Kiosk. Distinct from a saved Kiosk configuration. Subscription limits may apply to simultaneously active sessions. Security model undecided.

---

## Notifications

### Notification Rule **(confirmed concept, implementation provisional)**

A configured trigger that sends a notification when a specific Action occurs (e.g., student check-in notifies parent). Initial channel: transactional email. Engine architecture undecided.

---

## Data Concepts (Approved Conceptual Architecture)

Conceptual relationships approved in [ARCHITECTURE.md](./ARCHITECTURE.md). **Not** Django models, database tables, fields, or API design.

```
User
  └── at most one active customer OrganizationMembership
        └── role: owner | admin | staff

Organization
  ├── Member
  │     └── GroupMembership (per Group)
  │           └── (future) group-specific field values
  ├── Group
  │     ├── GroupMembership (linked Members)
  │     └── GroupOnlyParticipant
  └── (future) Event
        └── Event Entry

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
| Django `is_staff` / platform admin flags as Organization staff roles | OrganizationMembership roles (owner, admin, staff) | Platform operator access ≠ customer workspace roles |
| Merging User and Member because they represent the same person | Separate User and Member records with separate lifecycles | Login access and tracked participation are different concerns |
| One customer User managing multiple Organizations | Separate User accounts per Organization workspace | Customer Users belong to one Organization; no org-switching in one login |

---

## Terminology Requiring Final Approval

| Term | Options / Notes |
|------|-----------------|
| Kiosk Session | May need refinement once security model is designed |
| Organization role capabilities | Role names owner/admin/staff approved; permission matrix undecided |
| User ↔ Member explicit linking | Same real person may be both; any explicit link/deduplication mechanism undecided |
| Plan tier names | Basic / Pro / Business are examples only |
| Event sub-concepts | Whether some Events later need separate Reservation and Attendee structures remains undecided |
