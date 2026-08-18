# Terminology

Canonical and provisional product terms for the Configurable Check-In / Attendance SaaS Platform.

Terms marked **(provisional)** require final approval. Terms marked **(confirmed)** are established in current product planning.

---

## Platform Level

### Platform **(confirmed)**

The SaaS system operated by the platform team. Encompasses all Organizations, infrastructure, billing, and platform administration.

### User **(confirmed)**

A person with a platform account who can authenticate to the system. A User is **not** the same as an Organization. A User may belong to or manage multiple Organizations.

### Plan **(confirmed concept, details provisional)**

A subscription tier (e.g., Basic, Pro, Business) defining feature access and usage limits. Exact names, prices, and limits are **not finalized**.

### Subscription **(confirmed concept, details provisional)**

An Organization's billing relationship with the Platform. Tied to a Plan. Implementation details undecided. Subscription/billing status is separate from Organization identity.

---

## Organization Level

### Organization **(confirmed)**

An isolated customer tenant on the Platform. An Organization configures and operates its own check-in/attendance system.

An Organization may be in trial, actively subscribed, cancelled, suspended, or another billing state. Billing/subscription status is **separate** from the identity of the Organization itself. An Organization is not defined by currently paying.

Tenant isolation remains fundamental: all Organization data is strictly separated from other Organizations.

### Organization Admin / Staff **(confirmed concept, permissions provisional)**

People who manage an Organization through the administration dashboard. May include owners, administrators, and staff with varying permissions. Exact role model is **undecided**.

### Member **(confirmed)**

A reusable canonical person profile belonging to an Organization. It contains the Organization-level data configured for that person. A Member may be attached to multiple Groups without duplicating the canonical Member record.

Possible data may include name, email, phone, photo, member code, and other Organization-configured fields. These examples are **not** necessarily mandatory fields.

Group-specific overrides belong to **Group Membership**, not to the canonical Member record.

### Group **(confirmed)**

An Organization-defined collection/context for participants with its own configurable fields, allowed actions, kiosk behavior, and notification rules. Remains generic (e.g., Students, Employees, Morning Class).

### Group Membership **(confirmed)**

The relationship attaching a Member to a Group. Holds group-specific context and may override canonical Member field values without modifying the Member's canonical data.

**Example:** Canonical email `abc@gmail.com` vs Employee Group email `john@company.com`.

### Group-only Participant **(confirmed)**

A participant added directly to a Group without a full reusable Organization Member profile. Useful for temporary or lightweight participation. May be linkable to a canonical Member in the future.

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

## Data Concepts (Internal, Not Final)

These describe intended internal relationships. **Not approved database design.**

```
Organization
  ├── Member
  │     └── Group Membership (per Group)
  │           └── Group-specific field values
  ├── Group
  │     ├── Group-only Participants
  │     └── Group Memberships (linked Members)
  └── Event
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

---

## Terminology Requiring Final Approval

| Term | Options / Notes |
|------|-----------------|
| Kiosk Session | May need refinement once security model is designed |
| Group Membership | Internal name may change during architecture design |
| Plan tier names | Basic / Pro / Business are examples only |
| Event sub-concepts | Whether some Events later need separate Reservation and Attendee structures remains undecided |
