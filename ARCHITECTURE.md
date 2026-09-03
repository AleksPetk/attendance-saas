# Technical Architecture

Technical architecture source of truth for the Configurable Check-In / Attendance SaaS Platform.

For product behavior, see [PRODUCT.md](./PRODUCT.md). For terms, see [TERMINOLOGY.md](./TERMINOLOGY.md). For decisions, see [DECISIONS.md](./DECISIONS.md). For MVP boundaries, see [MVP.md](./MVP.md).

This document describes **approved conceptual architecture** only. It does **not** define Django models, database fields, API endpoints, or implementation details unless explicitly noted as future work.

---

## Scope of This Document

### Approved in this document

The **tenant and person foundation**:

- global **User** (platform operators and paying customer owners only)
- **Organization** as the tenant boundary, with a required one-to-one **owner** User
- **WorkspaceStaffAccount** for customer-created workspace admin/staff logins
- **Member** owned by one Organization
- **Group** owned by one Organization
- **GroupMembership** linking Member ↔ Group
- **GroupOnlyParticipant** scoped to one Group

Cross-cutting rules for tenant isolation, data ownership, and historical integrity that apply to this foundation.

**Product relationship rules recorded here (models not designed):** Group vs Event lifecycle; each Group and each Event owns its kiosk configuration; no global workspace kiosk.

### Explicitly not designed here

Do not infer implementation from this document for:

- Django models, fields, or migrations
- REST/API design
- Event / Event Entry **database schema** (lifecycle and kiosk-ownership rules are recorded above)
- Actions and Action Records
- Kiosk **database fields** for Events, and Event kiosk launch/session (Group kiosk launch, cookie-session lock, and exit-code unlock are implemented)
- subscriptions and billing **provider integration** (Stripe/Apple checkout, webhooks, Customer Portal). **V1 plan names/limits, ads, downgrade semantics, Account IA, purchase sources, entitlement layer, permanent USD prices, automatic 7-day built-in Business trial, upgrade/downgrade/cancel timing, and payment-failure grace are frozen** in PRODUCT.md and DEC-072–082 / DEC-093 — do not invent alternate tier names or silently change the matrix. Internal billing persistence is implemented in the `billing` app.
- configurable fields and group-specific overrides (this slice implements explicit GroupMembership override fields for name, email, photo, member identifier, and PIN — not a generic field engine)
- notification engine (Group after-action email via per-Group Custom SMTP / Gmail / Microsoft / Yahoo senders is implemented in this slice, including optional Group-level Forward Emails up to 3 private copies; broader engine channels and OAuth providers remain undesigned)
- platform-operator administration tooling

Those areas require separate architecture work and approval.

---

## Architectural Overview

The platform separates three concerns:

1. **Who pays and who operates the SaaS** — **User** (platform operators and the paying customer owner)
2. **Which customer workspace they own or staff** — **Organization** owned by one User; additional workspace logins are **WorkspaceStaffAccount**
3. **Who is tracked operationally inside a workspace** — **Member**, **GroupOnlyParticipant**, and later **Event Entry**

**Organization** is the customer **workspace**, **tenant boundary**, and **subscription boundary**. The real-world legal form of the customer (company, school, gym, sole proprietor, etc.) does not change the platform model.

**User** is a **platform-level** login account with **one globally unique normalized email**. It is used for:

- platform superusers / SaaS staff (`is_staff` / `is_superuser`)
- the **paying customer** who owns exactly one Organization

A paying customer User does not switch Organizations. If the same real person operates two separate Organization **workspaces**, they use **separate User accounts** (and therefore separate emails). One workspace may mix many real-world activities as Groups and Events.

Customer-created workspace **admin** and **staff** logins are **not** Users. They are **WorkspaceStaffAccount** records scoped to exactly one Organization. Staff **username** is unique **per workspace only**; the same username may exist in other workspaces. Staff login uses **Workspace ID + username + password**. The paying owner does **not** use Workspace ID.

**Member** is a tracked person inside an Organization. Members **do not access the Organization workspace** and generally do **not** need a User or WorkspaceStaffAccount login. The same real-world person may later be both a WorkspaceStaffAccount and a Member; those remain **separate records and lifecycles** with no required link.

```
Platform
  └── User (platform-level login)
        ├── (optional) platform operator access via is_staff / is_superuser
        └── at most one owned Organization (paying customer owner)

  └── Organization (customer workspace / tenant / subscription boundary)
        ├── owner → exactly one paying User
        ├── Workspace ID (immutable; staff login identifier)
        ├── WorkspaceStaffAccount (admin | staff; username unique per Organization)
        ├── Member (tracked person; no workspace access)
        │     └── GroupMembership (per Group)
        ├── Group (persistent / reusable participation context)
        │     ├── GroupMembership (linked Members)
        │     ├── GroupOnlyParticipant
        │     └── owned kiosk configuration (product rule; fields not designed)
        └── Event (temporary / one-time participation context; models not designed)
              ├── Event Entry
              └── owned kiosk configuration (product rule; fields not designed)
```

Operational customer data belongs to **Organizations**, not directly to Users. The paying customer accesses the workspace as the Organization **owner**. Additional workspace operators use **WorkspaceStaffAccount**. **Subscriptions** belong to the Organization workspace, not to Members. Registration automatically grants a **7-day built-in Business trial** on new normal workspaces (no card; DEC-093). Billing commercial state is separate from Organization identity and from `Organization.plan` entitlement.

**Members do not access the Organization workspace.** They are tracked operationally; participant check-in happens through **Kiosks** owned by a Group or an Event (kiosk fields and session model are not designed in this document).

One Organization workspace may contain **any mix** of Groups and Events (for example a school Group, a hobby Group, and a reservation Event). That mix does not require separate paying User accounts. Separate User accounts remain required only for separate Organization workspaces (DEC-033, DEC-047).

---

## Entities

### User

A **User** is a **platform-level login account**.

- Exists at platform scope as a login identity
- Used for **platform operators** (`is_staff` / `is_superuser`) and the **paying customer owner**
- The paying customer User owns **exactly one** Organization (one-to-one)
- Each User account has **one globally unique, normalized (lowercase) email**
- Paying customers must verify email before using the workspace (`email_verified`). This is separate from `is_active`. Platform operators are exempt from that customer gate.
- Paying customers do **not** switch between Organizations in one login
- If the same real person operates two separate Organization **workspaces**, they use **separate User accounts**
- Is **not** a WorkspaceStaffAccount, Member, GroupOnlyParticipant, or Event Entry person
- Customer-created workspace admin/staff must **not** be stored as Users

**Platform operator accounts** use the same User model. Django `is_staff` / `is_superuser` are global platform-operator flags. They remain separate from workspace owner/staff roles.

### Organization

An **Organization** is the internal **workspace**, **tenant boundary**, and **subscription boundary**. It is **not** a customer-facing legal/business entity or required display name.

- Owns all operational customer data within that tenant
- Has a required one-to-one **owner** FK to the paying `accounts.User`
- Receives a system-generated immutable **Workspace ID** used for staff/admin login and internal identification
- Does **not** require a customer-facing workspace name. An optional internal admin/support label may exist
- May have additional **WorkspaceStaffAccount** rows with roles **admin** or **staff**
- Billing and **Subscription** belong to the Organization workspace, separate from Member identity
- Registration automatically grants a 7-day built-in Business trial on new normal workspaces (no card; one-time; CheckStation-managed ineligible)
- All Members, Groups, GroupMemberships, GroupOnlyParticipants, and WorkspaceStaffAccounts belong to exactly one Organization
- Cross-Organization relationships are **forbidden**
- The customer may use one workspace for any mix of real-world activities; the platform does not verify legal/business structure

### WorkspaceStaffAccount

A **WorkspaceStaffAccount** is a customer-created workspace **admin** or **staff** login.

- Belongs to **exactly one** Organization and cannot move between Organizations
- Cannot be a global `accounts.User` and is **not** a Member
- Roles are **admin** or **staff** only. **owner** is not a staff-account role
- **Username is unique per Organization only.** The same username (for example `natsumi`) may exist in different workspaces
- Optional email uniqueness remains per Organization when set
- Login uses **Workspace ID + username + password**. The Workspace ID selects the Organization; username is looked up only inside that workspace
- The paying owner does **not** use Workspace ID; owner login is global User email + password
- Do **not** make staff usernames globally unique, and do **not** use the numeric Organization primary key as the staff login identifier
- Deactivating a staff account must **not** destroy Member records or future Action Records
- Platform `is_staff` / `is_superuser` are not used on this model

#### Workspace access roles

| Role | Who holds it |
|------|----------------|
| **owner** | The paying customer `accounts.User` on `Organization.owner` |
| **admin** | A `WorkspaceStaffAccount` in that Organization with `role=admin` |
| **staff** | A `WorkspaceStaffAccount` in that Organization with `role=staff` |

**Workspace Admin** capabilities are frozen in [DEC-070](./DECISIONS.md#dec-070--workspace-admin-customer-workspace-permissions): full operational workspace management except billing, Owner account/security, Admin-account management, ownership transfer, permanent deletion, and platform admin. Central enforcement lives in `organizations.permissions` (`CanManageWorkspace`, `CanManageStaffAccounts`, `IsWorkspaceOwner`, plus capability flags on current-workspace responses). **Workspace Staff** matrix is frozen in [DEC-071](./DECISIONS.md#dec-071--workspace-staff-group-scoped-permissions). Role permission does not override plan entitlements (DEC-073).

Do **not** use **OrganizationMembership** to attach global Users as workspace admin/staff. That model is retired.

### Member

A **Member** is a reusable canonical person profile **owned by exactly one Organization**.

- Represents a **tracked person** inside the Organization workspace
- **Does not access** the Organization workspace
- Generally does **not** require a User login
- Contains Organization-level person-profile data. **Name** is required and is **not** unique. Optional profile fields are email, date of birth, phone, address, photo, and notes. The database primary key is the visible Member ID (`#1`, `#2` …); there is no customer-facing `MBR-XXXXXX` code. Member-level PIN and check-in identifier are **not** product profile fields. Those columns may remain temporarily on the model as deprecated Group/Kiosk fallback until participation identification is redesigned.
- **Archive** is the reversible removal path and blocks profile edit. An archived Member stays attached to existing GroupMembership rows so Restore can reuse them, but operational Group, kiosk, and attendance queries require `member.status == active`. **Restore** returns the same Member ID, profile, and participation. **Permanent delete** is allowed only after archive: related GroupMembership rows are removed; ActionRecord snapshot fields remain and the Member FK is set null.
- Is **not** a User and must not be merged into the User model
- May belong to **multiple Groups** within the same Organization via GroupMembership
- Must not be shared across Organizations
- Must not be duplicated per Group

The same real-world person may also have a **WorkspaceStaffAccount** (e.g. a teacher who launches a kiosk) and a **Member** record so their attendance can be tracked. Those remain **separate**. Disabling or removing a WorkspaceStaffAccount must **not** destroy that person’s **Member** attendance history.

Which extra fields a Group or Event workflow requires is **not** a global Member-schema question. Those requirements are validated **for that context**. Name is the only Organization-level Member field that is universally required (see [DECISIONS.md](./DECISIONS.md) DEC-053).

### Group

A **Group** is an Organization-defined **long-lived, reusable participation and activity configuration** **owned by exactly one Organization**. It is not merely a folder of people, and it is not a temporary Event.

- Examples: Employees, Students, Morning Class
- **`group_type`:** `standard` (participants directly on the Group) or `structured` (participants under Classes / `GroupSection`). Immutable after create; existing Groups are `standard`.
- Contains GroupMemberships and GroupOnlyParticipants (Structured: each participation row requires a `section`)
- Must not span Organizations
- **Owns its own kiosk configuration automatically** (product rule). Creating a Group gives it kiosk capability and a `KioskDesign` foundation without a customer-facing “Kiosk enabled” toggle. Structured live kiosk is Card-only (Class → Participant → Action; see DEC-066). Standard Group Card/Input kiosk remains unchanged.
- Basic Group settings are: name, check-in, check-out, breaks, maximum breaks (1–3 when breaks are enabled), relevant after-action behavior, Advanced settings (Group outgoing email sender and optional Forward Emails), and for Structured Groups `require_class_pin` (when ON, every active Class needs a Class PIN before launch)
- **Group email sender:** each Group may own one `GroupEmailSender` (OneToOne). Providers: **Custom SMTP**, **Gmail (App Password)**, **Outlook / Microsoft 365** (SMTP AUTH), and **Yahoo Mail** (App Password). Credentials are encrypted at rest (`APP_SECRETS_ENCRYPTION_KEY`). Configuration is draft-tested before save: a successful draft test unlocks confirm-save, which persists credentials and marks **Ready**. Failed drafts do not replace an active Ready sender. Statuses: Not configured / Ready / Error (unverified drafts are not persisted as Needs verification). After-action emails require Ready and send through this sender, not platform Resend. Each participation stores `participation_emails` (JSON list, max 3); legacy `participation_email` / visitor `email` mirror `[0]`. Optional Group `forward_emails` (JSON list, max 3) are configuration recipients—not sender credentials. After-action delivery builds one unique recipient set (all participation emails + forwards) and sends separate private messages per address. `GroupEmailDelivery` audit rows record each recipient attempt with `recipient_kind` (`participant` | `forward` | `test`) without secrets. Delivery failure never rolls back attendance. Forward Emails apply to Standard and Structured Groups at the parent Group level (not per Class). Gmail uses internal SMTP transport `smtp.gmail.com` SSL/TLS port 465. Microsoft uses STARTTLS port 587 on `smtp.office365.com` (Microsoft 365) or `smtp-mail.outlook.com` (consumer domains). Yahoo uses `smtp.mail.yahoo.com` SSL/TLS port 465. Host/port/security are not customer-facing for Gmail, Microsoft, or Yahoo. The Microsoft provider is primarily for Microsoft 365 business/work mailboxes with Authenticated SMTP enabled; personal Outlook/Hotmail compatibility is not guaranteed. Switching providers clears the previous provider’s encrypted secret only when a verified draft is confirmed and saved. Google/Microsoft/Yahoo OAuth are not implemented. Shared SMTP transport code is reused across providers. MVP dedicated mailbox providers stop at these four (Custom SMTP + Gmail + Microsoft + Yahoo). Automatic check-in was removed from the customer product; deprecated Group columns may remain for migration compatibility.
- Group basic settings are **not** a Member-profile requirements form. Deprecated `require_*` columns may remain temporarily for kiosk identification compatibility until the next Kiosk cleanup
- **Archive** is the normal removal path. Archived Groups are operationally inactive (no edit, no kiosk, no attendance actions) but retain configuration, memberships, and kiosk design. **Restore** reactivates the same Group PK. **Permanent delete** is archive-only and preserves ActionRecord snapshots (`ActionRecord.group` SET_NULL, `group_name_snapshot` retained, immutable `source_group_id` retained for attendance reports)

Group-specific kiosk identification and presentation fields remain on Group for now but belong to the later Kiosk product area, not Group basic settings.

### KioskSettings (implemented)

**Structured kiosk runtime:** start returns Class cards (not all people). `GET …/kiosk/classes/<section_id>/people/` loads that Class’s operational participants (re-checks Class PIN via query when required). `POST …/kiosk/classes/<section_id>/verify-pin/` reports success/failure only. Confirmation payload may indicate return to Class selection. Actions and attendance reset reuse the Standard Group state machine.

Each Group has exactly one **`KioskSettings`** record (OneToOne), created automatically with the Group. It owns behavioral kiosk configuration:

| Area | Fields / behavior |
|------|-------------------|
| Mode | `card` or `input` (Structured Groups are forced to `card`; Input is not offered) |
| Card display | show name, group participant code (Structured UI label: Class Participant Code), email (when Group email enabled) |
| Kiosk PIN usage | `use_pin` — requires Group PIN enabled; forces participant code visible on cards |
| Input mode | Standard only: 1 field (code only) or 2 fields (code + name/email/pin) |
| Confirmation screen | preset template key; per-action message templates; return delay 1/3/5 sec (default 3) |
| Attendance reset | `attendance_reset_mode` (`daily` \| `rolling`); Daily local-time boundary (`attendance_reset_daily_time`, default 00:00); Rolling duration (`attendance_reset_rolling_hours` + `attendance_reset_rolling_minutes`, default 8h); persisted manual boundary `manual_reset_at` (Reset now) |
| Exit security | hashed `exit_code_hash`; never returned in API |

**Attendance reset runtime:** `compute_current_attendance_state()` filters ActionRecords to those on or after the effective boundary from `kiosk_builder.attendance_reset`. Daily uses Group-wide local clock boundaries via `get_report_timezone()` (project/workspace TZ until Organization timezone exists). Rolling anchors to the participant's current cycle check-in; break/check-out do not extend the window. Manual Reset now sets `manual_reset_at` immediately for all participants without altering scheduled Daily/Rolling settings. Reset never deletes or edits ActionRecords — History and reports remain unchanged.

**Reset now API:** `POST /api/groups/<id>/kiosk-settings/reset-now/` (`CanManageWorkspace`).

**Confirmation runtime:** perform success returns resolved message (variables substituted server-side), template key, and return delay. Display delay does not delay ActionRecord creation. Main background remains visible behind a scrim + readable preset card; accent may derive from kiosk input template accent.

**Readiness:** real kiosk launch blocked until Group setup complete, Kiosk Settings valid, and exit code configured. Kiosk Builder remains available while invalid (fake sample content only; no attendance mutations).

**Kiosk shell:** Header, Main, and Footer always exist. Section sizes are automatic/responsive (not toggled in Settings). Visual blending (matching backgrounds, empty content) is how customers make Header/Footer unobtrusive. `KioskDesign` owns appearance; `header.enabled` / `footer.enabled` in stored JSON are normalized to `true` and ignored for rendering.

**Deprecated Group columns** (retained for migration, not runtime source of truth): `kiosk_mode`, `kiosk_list_show_*`, `kiosk_input_field_*`, legacy identifier enums, `kiosk_success_message`, `kiosk_confirmation_message`, `kiosk_return_delay_seconds`.

### GroupMembership

A **GroupMembership** links one **Member** to one **Group**.

It stores Group-scoped participation data: immutable Group participant code, `participation_emails` (up to 3 notification addresses; legacy `participation_email` mirrors the first), participation PIN, and optional legacy overrides (name/email/photo/identifier). Member profile email is not the after-action recipient; it may prefill participation email #1 on add only.

- Both Member and Group must belong to the **same Organization**
- Is a real domain entity, not an implicit join table only
- Holds immutable **group_participant_code** (`G{group_id}-{suffix}`), Group participation **emails** (max 3), and Group participation **PIN** (attendance check-in code, visible to workspace managers, hidden from participant-facing kiosk lists)
- Optional legacy override fields (name, photo, identifier) remain for kiosk compatibility; Member profile email/PIN are not the canonical participation source for newly configured Groups
- Archiving a Member does **not** delete or deactivate the GroupMembership. Operational lists, kiosk identification, and attendance actions ignore memberships whose Member is archived. Restore makes the same membership operational again.

A Member may have multiple GroupMembership records within one Organization. The same Member in two Groups receives two different participant codes. Within one Structured Group, a Member has at most one membership (unique per Group); the `section` FK points to the current Class and may change later without regenerating the participant code.

**Setup incomplete:** when Group participation requirements are enabled but operational participants lack required email/PIN, the Group remains editable but real kiosk/attendance operations are blocked until data is completed or the requirement is turned off. Stored participation values are retained when requirements are disabled. For Structured Groups, only participants in **active** Classes count; archived Classes and archived Members do not. Structured readiness also requires ≥1 active Class with operational participants, and when `require_class_pin` is ON every active Class must have a Class PIN (missing PINs produce messages such as “2 Classes need a PIN”). Turning `require_class_pin` OFF does not erase stored Class PINs.

### GroupSection (Class)

Backend name **`GroupSection`**; product label **Class**. Child of a Structured Group only.

- Belongs to exactly one Structured Group and the same Organization
- Visible immutable PK style (`Class #12`)
- Optional **Class PIN** (hashed at rest as `class_pin_hash`) for Structured kiosk Class entry when the parent Group has `require_class_pin` ON — managers may set/reset but cannot retrieve the raw PIN after save; APIs expose `has_class_pin` only; never returned in participant-facing kiosk list/config payloads
- Active Class names unique within a Group (case-insensitive among active rows)
- Lifecycle: Active → Archive → Restore or Permanent Delete (permanent delete removes Class participation rows; ActionRecords remain Group-scoped with Class snapshot fields `source_section_id` / `class_name_snapshot`; live `section` SET_NULL)
- Live kiosk: empty active Classes are hidden from Class cards; archived Classes are hidden; Class people are loaded per Class after selection/verification
- **Standard Group snapshot import (DEC-067):** `POST /api/groups/<structured_id>/classes/import-standard-group/` creates a Class and copies operational Standard Group participants into new destination participation rows (new codes; full `participation_emails` list copied; Members skipped if already in the destination Group). Sources: `GET …/classes/import-sources/`. No sync afterward; settings/kiosk/history never copied.

### GroupOnlyParticipant

A **GroupOnlyParticipant** is a participant scoped to **exactly one Group**.

- Exists without a reusable Organization **Member** profile
- Is **not** a User
- Is **not** a reusable Member
- Belongs to the same Organization as its Group
- Stores the same participation email list model as GroupMembership (`participation_emails`, max 3; legacy `email` mirrors the first)
- Useful for temporary or lightweight participation

Future linking or conversion to a Member is a product decision, not defined here.

---

## Group / Event / Kiosk ownership (product rules; models not designed)

These rules are **confirmed product architecture** and must be followed when Event and Kiosk models are later designed. This section does **not** approve Django models, kiosk fields, or Event schema.

| Rule | Requirement |
|------|-------------|
| Group lifecycle | Long-lived, reusable participation context |
| Event lifecycle | Temporary / one-time participation context |
| Same role, different lifecycle | Group and Event are similar as participation contexts (identification, Actions, owned kiosk, outcomes) but must not be collapsed into one entity |
| Group kiosk ownership | Each Group owns its own kiosk configuration |
| Event kiosk ownership | Each Event owns its own kiosk configuration |
| No global workspace kiosk | Kiosk configuration is **not** an Organization-level resource attached to, or switched between, arbitrary Groups and Events |
| Initial cardinality | One owned kiosk configuration per Group and per Event. Multiple variants per Group/Event are a future decision, not an MVP requirement |
| Event Entries | May represent temporary people without creating reusable Members; Action Records for those people still remain |
| Plan-limit direction | Plans may later limit persistent Groups and Events on different axes. Exact numbers are not decided. Do not count independently assigned workspace kiosks as the primary limit |

Do **not** implement Kiosk or Event models from this section.

---

## Relationship Rules

| Rule | Requirement |
|------|-------------|
| User ≠ Member | Login accounts and tracked person profiles are separate concepts, even for the same real-world person |
| No required User ↔ Member link | The same person may exist as both User and Member without an explicit link; any linking mechanism remains undecided |
| Staff login lifecycle ≠ Member lifecycle | Disabling a WorkspaceStaffAccount must not destroy that person’s Member attendance history |
| Operational data ownership | Customer operational data belongs to Organizations, not directly to Users |
| Subscription ownership | Subscriptions belong to the Organization workspace, not to Members |
| Customer User email | One globally unique normalized (lowercase) email per User account |
| Paying User ↔ Organization | One-to-one: the paying User is `Organization.owner` |
| Workspace staff ↔ Organization | Many-to-one WorkspaceStaffAccount; cannot move between Organizations |
| Workspace staff identity | Username unique per Organization only; optional email unique per Organization when set; identical usernames in different workspaces are valid |
| Workspace ID | System-generated, globally unique, immutable; used for staff/admin login and internal identification; not used by the paying owner; not the numeric Organization PK |
| Workspace display name | Not required; not used for authentication; optional internal admin label only |
| Organization owner role | Held only by the paying User; not a WorkspaceStaffAccount role |
| No customer org switching | Paying Users do not switch Organizations in one login |
| Separate workspaces, separate User accounts | The same real person operating two Organization **workspaces** uses two paying User accounts. One workspace may mix many real-world activities as Groups and Events |
| Member does not access workspace | Members are tracked people; workspace access is the owner User or a WorkspaceStaffAccount |
| Group ↔ Organization | Many-to-one; one Group, exactly one Organization |
| Group owns kiosk configuration | Product rule; kiosk fields not designed here |
| Member ↔ Group | Many-to-many via GroupMembership, within one Organization |
| GroupOnlyParticipant ↔ Group | Many-to-one; scoped to one Group (and therefore one Organization) |
| Event ↔ Organization | Many-to-one (product rule; Event models not designed here) |
| Event owns kiosk configuration | Product rule; kiosk fields not designed here |
| Cross-Organization links | Forbidden across all entity types in this foundation |
| Platform admin ≠ workspace roles | Django `is_staff` / `is_superuser` are platform-operator flags, not owner/admin/staff workspace roles |

---

## Tenant Isolation

Tenant isolation is **non-negotiable**.

Organization A must never access Organization B’s data, including Members, Groups, GroupMemberships, GroupOnlyParticipants, WorkspaceStaffAccounts, Events, Event Entries, Group/Event-owned kiosk configurations, and all future Organization-scoped entities.

Enforcement must occur at:

1. **Application level** — authorization, query scoping, and service boundaries always constrain access by Organization
2. **Database level where practical** — schema design, constraints, and query patterns should make cross-tenant access difficult or impossible, not merely discouraged

Tenant isolation applies to the paying owner through `Organization.owner` and to workspace operators through WorkspaceStaffAccount: they may only access the Organization they own or belong to, and only when that Organization is active.

Implementation mechanisms (row-level security, tenant ID columns, middleware, etc.) are not decided here.

---

## Models Not Permitted

### No generic Person model

Do **not** introduce a shared **Person** superclass or generic person table that merges User, Member, GroupOnlyParticipant, and Event Entry people.

Each concept serves a different purpose and must remain distinct.

### No cross-Organization person reuse

A Member in Organization A must not be linked to Organization B. The same real-world human may appear as separate Members in different Organizations, but not as one shared Member record.

### No required User ↔ Member link

Do **not** require or assume a database link between a User and a Member, even when they represent the same real-world person. Any explicit linking or deduplication mechanism remains a separate design decision.

### No global User for workspace admin/staff

Do **not** create `accounts.User` records for customer-created workspace admin/staff. Those logins are **WorkspaceStaffAccount** rows scoped to one Organization.

### No multi-Organization paying User

Do **not** design paying-customer login, session, or dashboard around switching Organizations. A paying User owns at most one Organization. Multi-workspace operators use separate paying User accounts.

### No global workspace kiosk

Do **not** design a Kiosk as an Organization-level resource that is assigned to multiple Groups and Events, or that switches between them. Kiosk configuration is owned by the Group or Event it serves.

### No collapsing Group and Event

Do **not** merge Group and Event into one entity because they both own kiosk configuration. Lifecycle differs: Group is persistent/reusable; Event is temporary/one-time.

---

## Historical Integrity and Deletion

This foundation participates in the platform’s historical integrity rules:

- Once operational records have dependent history (for example, Action Records), prefer **archive** or **deactivate** over destructive deletion where appropriate. Confirmed permanent Member deletion after archive clears the live Member FK on Action Records (`SET_NULL`) and keeps snapshot fields readable.
- Exact archival and deactivation behavior for Members, Groups, GroupMemberships, and GroupOnlyParticipants is implemented as reversible archive/deactivate. An archived Member remains structurally related via GroupMembership but is operationally inactive until restored, and may later be permanently deleted. Permanent tenant destruction uses a dedicated service rather than globally weakening `PROTECT` foreign keys.
- Do not silently overwrite or manipulate records in a way that destroys historical integrity
- Future Action Records must remain historically accurate when later Group, Kiosk, or Action configuration changes
- Action Record creation, correction, source-field design, and audit mechanics are **not designed here**
- Workspace History includes an **Activity Log** (raw Action Records) and an **Attendance Report** (participant × local day aggregation; Structured adds historical Class column and participant × Class × day grain). Report calendar presets (`today` / week / month) and day bucketing use an explicit client `timezone` IANA name when provided (browser local); otherwise Django `TIME_ZONE`. Report columns follow ActionRecord data in range, not live Group action toggles. Immutable `ActionRecord.source_group_id` keeps permanently deleted Groups selectable for reports; Class snapshots (`source_section_id` / `class_name_snapshot`) preserve Structured Class context (DEC-063, DEC-065)
- **Permanent customer account deletion** is a separate, explicit exception: after the paying owner or a platform superuser confirms destruction of that tenant, that workspace's operational data including Action Records is removed. Archive/deactivate remains the reversible path. Platform admin cannot permanently delete a User who still owns an Organization (delete the Organization first). Organization permanent delete refuses while a live provider subscription exists. See DEC-052 and DEC-092.

### Organization status and CheckStation Account

`Organization.status` is `active`, `blocked`, or `archived`.

- **Active** — normal workspace operation.
- **Blocked** — platform-enforced access restriction. Owner workspace login, staff login, existing staff sessions, kiosk, and workspace APIs stop immediately. Data is kept. This is not archive. For a normal paid customer, blocking schedules provider `cancel_at_period_end` (no refund of the current period). Unblocking before period end resumes that subscription; unblocking after the subscription has ended returns the workspace to Basic with no paid row. CheckStation-managed workspaces change access only (no billing call; admin-selected plan is preserved).
- **Archived** — workspace lifecycle/archive state (existing archive semantics). Do not use archive as the abuse/security block.

`Organization.is_checkstation_account` is an Organization account mode (default off). It is not a Stripe subscription, complimentary billing row, or separate User type.

High-risk platform-admin actions (account mode, internal plan change, block/unblock, permanent deletes) use a confirmation page, `request.user.check_password`, a required reason, and a durable `PlatformAdminAction` snapshot. Platform TOTP still gates `/admin/`; there is no extra TOTP challenge per action.

## Authentication sessions

Check Station customer/workspace browser sessions (paying owner and WorkspaceStaffAccount) are isolated from Django `/admin/` platform-operator sessions. They use separate cookie names so the same browser can hold both. See DEC-051 and SECURITY.md.

Platform operators (`accounts.User` with `is_staff` or `is_superuser`) must complete TOTP (or a one-time recovery code) inside that admin session before `/admin/` pages are available. Password success stores a pending-2FA admin session and does not grant a full admin login. Customer owner and WorkspaceStaffAccount authentication do not use this flow. See DEC-030 and SECURITY.md.

---

## Plans, entitlements, and Owner Account architecture

Product matrix and policies live in [PRODUCT.md — Subscriptions and Plans](./PRODUCT.md#subscriptions-and-plans) and DEC-072–082. This section records the **technical architecture**.

### Entitlement layer (implemented)

Plan enforcement goes through an **internal entitlement / usage system** in `organizations.entitlements`, not through scattered Stripe checks.

Canonical catalog: `organizations.entitlements.catalog` (`basic` / `plus` / `business` limits + feature flags). Workspace **effective** plan is persisted on `Organization.plan` (default **Basic**). CheckStation-managed workspaces (`Organization.is_checkstation_account`) set plan only through `apply_effective_plan()` from a dedicated platform-admin action. Normal customer workspaces do not allow raw `Organization.plan` edits in Django admin; live paid entitlements follow billing/provider flows. Customers cannot mutate plan via workspace APIs.

Services answer for a workspace:

- what plan it is on (**Basic** / **Plus** / **Business**)
- which features are enabled
- the limit for a given resource
- current usage of that resource
- whether a requested operation may proceed
- whether the workspace is currently over limit (structured over_limit items)

Authenticated workspace payloads include an `entitlements` object. Frontend consumes it for Account → Subscription and lightweight lock/usage UI; **backend remains authoritative**.

**Role authorization** (Owner / Admin / Staff) and **plan entitlement** are separate. When both apply, both must pass.

**Active vs archived** quotas are separate where the product matrix lists both; archived usage does not consume active limits.

**Downgrade** never deletes data automatically; over-limit workspaces stay readable/operational where safe while blocking growth past the destination plan (DEC-073). **Scheduled** paid downgrades and cancellations must not change `Organization.plan` (and therefore must not run plan locks) until the effective date.

Downgrade enforcement uses persistent **plan locks** on Groups, Members, and
WorkspaceStaffAccounts without changing archive/deactivation lifecycle fields.
When a destination plan has fewer Standard Group, archived Group, Member, Admin, or
Staff slots than existing records, all records in that category are locked
until the paying Owner selects the records that remain operational. Structured
Groups are locked automatically when the feature is unavailable; Business
over-capacity keeps the oldest Groups by database ID up to its limit. Locked
resources remain readable to the Owner and their historical Action Records
remain intact. Slot selection is tenant-scoped and Owner-only.

**Member plan locks** control the reusable Member **profile** and future reuse
only. Existing GroupMembership / participation in an operational Group stays
intact (kiosk attendance, participation edits, Action Records). Locked Members
cannot be added to a **new** Group participation.

**Kiosk templates:** Card and Input template catalogs are available on every plan (Basic / Plus / Business). Template access is not a plan entitlement and must not be gated by plan. Basic still carries `ads_required`; effective advertising also requires the platform kill switch (see Basic ads below).

Stripe/web and other purchase sources update billing subscription state that **feeds** this layer through `apply_effective_plan()` (DEC-076, DEC-081).

### Billing domain (implemented; Stripe provider boundary ready)

Commercial lifecycle lives in the `billing` app (`WorkspaceSubscription`, OneToOne to Organization). It is optional: a workspace with no billing row is unsubscribed. During the built-in 7-day Business trial the workspace has Business entitlement without a billing row. After that trial, no billing row means Basic. **Built-in trial state** lives in `billing.WorkspaceBuiltinTrial` (OneToOne): immutable `started_at` / `ends_at` when granted, `consumed=True` always, `expired_at` after post-trial entitlement is applied. Existing workspaces were backfilled as consumed/never-granted. This row is separate from Stripe/Apple `trialing` (which only delays the first paid invoice). **CheckStation Account** (`Organization.is_checkstation_account`) is an Organization account mode, not a billing provider: no `WorkspaceSubscription` is created, Stripe lifecycle is not presented, the built-in trial is not granted, and `/api/billing/` mutations fail with `checkstation_managed_account`. Billing GET returns `managed_by_platform` / `commercial_billing_available`. Late Stripe webhooks must not recreate commercial state or overwrite admin-selected `Organization.plan` for those workspaces. Promotions resolve no audience (`none`) for CheckStation-managed workspaces; public anonymous catalog is unchanged.

Keep these separate:

| Concept | Owner |
|---------|--------|
| Effective entitlement plan | `Organization.plan` + `organizations.entitlements` |
| Built-in 7-day Business trial | `billing.WorkspaceBuiltinTrial` (one-time, no card, not Stripe/Apple) |
| Commercial/payment lifecycle | `billing.WorkspaceSubscription` |
| Stripe SDK / Checkout / Portal / webhooks | `billing.stripe_provider` (only Stripe call site) |
| Provider selection | `billing.provider` (`stripe` or `fake` for tests) |

Permanent USD list prices live in `billing.catalog` as **integer cents** (not in the entitlement catalog, not as floats, not as per-row prices). Promotions must not mutate that catalog. V1 eligibility groups (`new_basic` OFF/NORMAL/BIG, `plus_monthly` OFF/ON, `business_monthly` OFF/ON) live on platform singleton `PlatformPromotionSettings`, calculated in `billing.promotion`, and exposed as audience-aware `promotion` on the canonical catalog payload (DEC-091). **Plus Yearly and Business Yearly have no promotion.** The **10 simple offers** use **fixed Stripe coupon off-amounts**; backend `promotional_amount = normal − discount_amount` (Decimal/cents) so UI matches Checkout. Marketing % strings are labels only — clients must not recompute `normal × (1 − %)`. Coupons are configured via server-only `STRIPE_COUPON_*` env slots (`billing.coupons`); Plus Monthly→Business Yearly and Business Monthly→Business Yearly share `STRIPE_COUPON_BUSINESS_MONTHLY_TO_YEARLY`. Coupon IDs never appear in public APIs or `VITE_*`. Backend eligibility selects the coupon; Checkout/schedule attach `discounts=[{coupon}]` through the Stripe provider only. Stripe Price IDs map onto plan/interval pairs via settings (`STRIPE_PRICE_*`); never infer plan from amount.

Canonical effective plan mutation: `organizations.entitlements.apply_effective_plan()`. `Organization.save()` still syncs plan locks as a safety net. Billing services call `apply_effective_plan()` for upgrades, effective downgrades, built-in trial grant/expiry, and transitions to Basic. Stripe/Apple `trialing` records a deferred paid start only and must not grant the built-in trial. Do not scatter Stripe objects through Groups/Members/Staff/Kiosk code.

Owner-only HTTP APIs under `/api/billing/` expose current billing state, Checkout (allowed during the built-in trial; paid start deferred to trial end), upgrade preview/apply, period-end downgrade, cancel-at-period-end, **resume scheduled cancellation**, **cancel scheduled downgrade**, and Customer Portal. There is no `/api/billing/trial-checkout/` and no card-required Business trial. Browser `?checkout=success` is UX only; paid activation requires verified webhook/provider reconciliation. Built-in trial expiry is lazy on workspace/billing reads plus `expire_builtin_trials`; it does not depend on Stripe webhooks. Reversing a pending cancellation or downgrade requires a successful provider operation first, then clears internal pending state; the existing Stripe subscription and billing cycle are preserved (no new Checkout). CheckStation-managed workspaces reject paid mutation endpoints; Owner Account hides Subscription/Billing when `can_view_billing` / `can_manage_subscription` are false.

Webhook: `POST /api/billing/webhooks/stripe` (CSRF-exempt, no session auth, signature-verified). Idempotency uses `ProviderEvent` with atomic claim `RECEIVED|FAILED → PROCESSING → PROCESSED` (or `IGNORED` / `FAILED`). Only one worker may transition a given event into `PROCESSING`; concurrent duplicates return an idempotent success without re-dispatch. Stale `PROCESSING` may be reclaimed after 15 minutes. Allowed through `KioskLockMiddleware`. Reconciliation must not change `Organization.status` from `blocked` to `active`. For CheckStation-managed workspaces, entitlement reconciliation is skipped. `WorkspaceSubscription.external_customer_id` / `external_subscription_id` are indexed for webhook lookup (not unique).

Permanent owner deletion (DEC-096): sensitive-action re-auth (password or OAuth verify + 2FA when enabled); blocked while a live commercial subscription exists (`active_subscription`); built-in trial alone does not block; does not auto-cancel Stripe.

Payment-failure grace emails: management command `send_billing_payment_warnings` (once per UTC day during the 3-day grace; claims the daily slot under row lock before send). Schedule daily in deployment; no Celery in this phase. Built-in trial expiry command `expire_builtin_trials`: every 5–15 minutes (or at least hourly); row-locked and idempotent. Skip CheckStation-managed workspaces and non-`active` Organizations (blocked/archived) for payment warnings.

**Production cache (DEC-097):** Local dev uses LocMemCache. Production requires `REDIS_URL` and `django-redis` for shared Django cache across Gunicorn workers. Used for auth rate limits (owner/staff login, password reset, verification resend IP), Contact limits, kiosk Class PIN / exit limits, and provider-health probe rate limits. `IGNORE_EXCEPTIONS=True` fails open on transient Redis errors (auth continues; limits may be weakened). Behind reverse proxy: `USE_X_FORWARDED_FOR=True` and `TRUSTED_PROXY_IPS` must list only trusted proxy hops.

**Live Stripe account / TEST credentials are not configured in-repo.** Apple IAP and monthly↔yearly interval-change execution remain open (OPEN-011 narrowed, OPEN-015).

Internal statuses are provider-neutral: `none`, `trialing` (provider billing delay / deferred first paid period), `active`, `past_due` (grace), `canceled`. Scheduled cancellation while access remains is `cancel_at_period_end` on an otherwise active/trialing/past_due row — not a separate “canceling” entitlement plan. `WorkspaceSubscription.trial_started_at` / `trial_ends_at` describe that provider delay, not the built-in 7-day Business trial.

### Purchase source

Subscription commercial ownership may come from `none`, `stripe`, or `apple`. Account Subscription/Billing UI respects the source: Stripe portal/change actions only for Stripe; Apple shows truthful non-Stripe management copy. Basic/free workspaces have no paid purchase source.

### Owner Account area

Owner Account surfaces are three top-level sections/pages:

| Section | Responsibility |
|---------|----------------|
| **Security** | Login/primary email, backup email, password, optional Owner TOTP 2FA, Danger Zone / permanent deletion. Always shown. |
| **Subscription** | Plan, status, limits/usage, Checkout/upgrade/downgrade/cancel, resume scheduled cancellation, cancel scheduled downgrade, renewal, purchase-source-aware management. Hidden for CheckStation-managed accounts. |
| **Billing** | Lightweight summary + Stripe Customer Portal for invoices/payment method when `purchase_source=stripe`. Hidden for CheckStation-managed accounts. |

Public `/pricing` presents Basic / Plus / Business with catalog prices (monthly/yearly). Unauthenticated paid CTAs route through registration/login; Checkout starts only for the authenticated workspace owner.

### Basic ads (placement architecture)

Ads are a **Basic**-only commercial surface. Effective advertising is:

`features.ads_required` (plan catalog) **AND** platform `ads_globally_enabled` (singleton `PlatformAdvertisingSettings`).

Do **not** enforce ads with `require_feature` / `deny_plan_feature` — `ads_required` polarity means “eligible/required to show ads,” unlike other feature flags.

Frozen **web** placements:

- `dashboard_banner`
- `groups_banner`
- `kiosk_launch_interstitial` (workspace route, **before** `POST /api/groups/:id/kiosk/` lock)
- `kiosk_exit_interstitial` (after successful exit-code unlock, **before** Group/Groups navigation)
- `kiosk_builder_exit_interstitial` (after dirty-state resolution, **before** destination navigation)

**Live participant kiosk sessions must never show ads.** Do not put ads in `GroupKioskScreen`, `KioskRenderer` (`mode="live"`), `KioskBuilderPreview`, Kiosk Settings, Members, History, Staff, or Account.

Authenticated workspace payloads include an `advertising` object (`enabled`, `provider`, `placements`) beside `entitlements`. Fetch this **before** kiosk lock; do not add an ads request that must run while locked.

Current provider is **mock** (local development). A real provider is deferred until deployment. Provider/render failure is **fail-open**: banners omit, interstitials skip, and the original navigation continues.

Platform operators toggle advertising from Django admin (dashboard card + confirmation). Workspace APIs cannot change the kill switch. Django admin History/`LogEntry` records the change.

Plus/Business have no ads (`ads_required=False`). Provider choice remains open beyond mock.

---

## Production domain family (frozen)

**DEC-088.** These are official production origins, not examples. Local development stays on localhost. DNS, Nginx, cookies, CORS, redirects, and application origin wiring are **not** implemented in this decision.

Temporary `*.checkstation.alekspetk.com` hostnames used as production examples in DEC-085–087 are **superseded for current architecture**. Those decision records are not rewritten.

| Production origin | Responsibility |
|-------------------|----------------|
| `checkstation.app` | Promotional / marketing website: homepage, features, how-it-works, pricing, public Contact (`/contact`), registration entry point, sitemap / `robots.txt` for marketing pages |
| `workspace.checkstation.app` | Owner login, staff login, workspace UI, account/security, subscription/billing, password reset, email verification, Stripe/account callback returns, **and public API under `/api/...`** |
| `docs.checkstation.app` | Documentation home, Getting Started, Groups & Members, Kiosk Setup, Billing & Plans, FAQ, Privacy Policy, Terms of Use, Support |
| `status.checkstation.app` | Standalone public Status page and public Status API |

**Frozen (DEC-095):** public API hostname/routing. There is **no** `api.checkstation.app`. The API is `https://workspace.checkstation.app/api/...` (reverse proxy routes `/api/*` to Django). Native clients will use the same origin later.

**Platform administration** intended hostname: `manager.checkstation.app` (private management origin). It may still share the Django API process via `/admin/` until a later reverse-proxy split. It is not a sitemap/robots/public-nav target. Obscurity is not a security control; platform-admin authentication and mandatory 2FA remain required.

**Intended production email (config concepts stay separate):**

| Concept | Env | Production intent |
|---------|-----|-------------------|
| Platform transactional From | `RESEND_FROM_EMAIL` | `accounts@checkstation.app` |
| Public Contact destination | `CONTACT_TO_EMAIL` | `contact@checkstation.app` |
| Published legal contact placeholder | `LEGAL_CONTACT_EMAIL` | same public mailbox when designated; still a separate setting |

Do not store the private forwarding mailbox in application config or public content.

**Intended future link origins (application still uses local `FRONTEND_BASE_URL` / Vite env until a later implementation task):** auth, password reset, email verification, and Stripe return URLs → `workspace.checkstation.app`; Contact → `checkstation.app/contact`; Docs → `docs.checkstation.app`; Status → `status.checkstation.app`.

**Indexing intent (not implemented here):** index `checkstation.app` marketing pages and `docs.checkstation.app` documentation/legal pages. Generally do not index authenticated workspace app pages or the private platform-management origin. Status indexing is a later SEO choice.

Local origins remain `http://localhost:5173` (current combined SPA), `http://localhost:8000` (API), `http://localhost:8090` (Status), `http://localhost:8091` (Docs).

---

## Public Status service (implemented)

**STATUS IS API-FIRST.** The public status website is one client of the Status API. Future workspace, iOS, Android, and desktop Status screens consume the same JSON without opening a browser.

The Status service is a small independent Python process (`status/`) with SQLite storage. It does **not** use main PostgreSQL and does **not** require Django or the main React app to be healthy in order to serve the status page and API.

| Item | V1 |
|------|----|
| Local origin | `http://localhost:8090` |
| Production origin | `status.checkstation.app` (DEC-088) |
| Current status | `GET /api/status/current/` |
| Incidents | `GET /api/status/incidents/` |
| Maintenance | `GET /api/status/maintenance/` |
| Webpage | `GET /` on the Status service |

Probes run server-side every 60 seconds (configurable). Browsers poll the Status API only (default 30 seconds). Django health helpers used by probes: `GET /api/health/` (503 if PostgreSQL is down), `GET /api/health/kiosk/` (read-only kiosk runtime), `GET /api/health/email/` (Resend health without sending mail: `GET /domains` for full-access keys, or an invalid `POST /emails` that must 400/422 for sending-only keys; a 401 on `/domains` is not an outage), `GET /api/health/stripe/` (Stripe Balance retrieve via the billing provider). CSRF `GET /api/auth/csrf/` plus API health back Authentication. Workspace web app is probed at `/login`; the promotional site at `/`. Documentation stays Unknown until `STATUS_DOCS_URL` is set.

Public JSON may include component id/name/state/label, timestamps, short descriptions, incidents, and maintenance. It must not include secrets, stack traces, tenant data, or provider raw errors.

Later Documentation, Privacy, Terms, and Support should follow the same canonical-source pattern. They are implemented as the Content API + Docs website (DEC-086, DEC-087). Contact is **not** a Status/Docs page; it lives on the main public site.

---

## Public Docs and legal content (implemented)

**DOCS/LEGAL CONTENT IS API-FIRST.** The public Docs website is one client of the Content API. Future workspace, iOS, Android, and desktop Docs/Help screens consume the same JSON/Markdown without scraping HTML and without requiring a browser redirect.

Canonical documents live in PostgreSQL (`content.Document`). Bodies are Markdown. Platform operators edit them in Django admin. The public API returns only `published` + `is_public` documents and never returns `admin_notes`, drafts, or unpublished rows.

| Item | V1 |
|------|----|
| Local Docs origin | `http://localhost:8091` |
| Production origin | `docs.checkstation.app` (DEC-088) |
| Document index | `GET /api/content/documents/` |
| Document by slug | `GET /api/content/documents/<slug>/` |
| Plan catalog (read-only) | `GET /api/content/catalog/` — prices/limits from billing + entitlement catalogs |
| FAQ list | `GET /api/content/faq/` — published structured entries (`?q=`, `?category=` optional) |
| V1 slugs | `documentation`, `getting-started`, `groups-members`, `kiosk-setup`, `billing-plans`, `support`, `faq`, `privacy-policy`, `terms-of-use` |
| FAQ storage | `content.FaqEntry` (stable slug, question, Markdown answer, category, keywords, sort, publish flags). Not a giant Markdown-only article. |
| FAQ search | No external search engine. Token AND match on question/answer/category/keywords; Docs UI filters client-side after one published fetch. Native apps can use the same JSON. |
| Docs website | standalone Python static site (`docs/`); fetches the Content API in the browser |
| Editing | Django admin, platform operators only (documents and FAQ entries) |

The Docs site does **not** remain available independently of Django the way Status does. Missing API content is an error/empty state on the Docs client, not a second copy of the legal text.

Promotional footer Documentation / Getting started / Kiosk setup / Groups & Members / Billing & Plans / FAQ / Support / Privacy Policy / Terms of Use open the Docs origin in a new tab (`VITE_DOCS_PUBLIC_URL`). Those documents and FAQ entries exist once as canonical API content; they are not duplicated into the promotional frontend. Website **Get started** remains `/register`. Footer **Contact** is the main-site `/contact` route (same tab).

Embedded Workspace/mobile/desktop Docs screens are **not** implemented in this slice. Future in-app Help must fetch the Content API (documents + FAQ), the Status API, and the Contact API, and render natively.

---

## Public Contact (implemented)

**Contact is not part of Docs.** The promotional Contact page is `/contact` on the main CheckStation site. Support is the Docs self-service hub.

| Item | V1 |
|------|----|
| Public page | `/contact` on the promotional site (`checkstation.app/contact` in production; same tab from the promotional footer) |
| Categories | `GET /api/contact/categories/` — stable ids, labels, subcategories, FAQ query mappings |
| FAQ suggestions | `GET /api/contact/suggestions/?category=&subcategory=` — ranked from canonical `content.FaqEntry` |
| Submit | `POST /api/contact/` — no login; reusable by future Workspace/iOS/Android/desktop clients |
| Storage | `contact.ContactRequest` persisted even if outbound email fails |
| Destination | `CONTACT_TO_EMAIL` — production intent `contact@checkstation.app` (DEC-088). Private forwarding mailbox is not stored in app config. |
| Mail | Verified CheckStation From (`RESEND_FROM_EMAIL`; production intent `accounts@checkstation.app`); Reply-To is the submitter |
| Anti-spam | Cloudflare Turnstile (server-side verify), honeypot `company_url`, IP rate limit, duplicate window |
| Privacy requests | `is_privacy_request` flag only; no automatic deletion/export |
| Admin | Platform Django admin only; review states new / reviewed / closed. Not a ticketing system. |

Local DEBUG may use Cloudflare official dummy Turnstile keys when env keys are empty. Production fails closed if Turnstile is required but unconfigured.

---

## Deferred Architecture

The following are confirmed **product concepts** but intentionally **excluded from detailed implementation design here**:

| Area | Status |
|------|--------|
| Event / Event Entry schema | Product concept and lifecycle/kiosk-ownership rules approved; database/API architecture not started |
| Action / Action Record | Product concept approved; architecture not started |
| Group kiosk launch / session lock | Implemented for Groups: cookie-session kiosk lock, exit-code unlock, live start/identify/perform. Event kiosk session remains undesigned |
| Subscriptions / Plans **provider integration** | **V1 names/limits, ads, downgrade, Account IA, entitlement layer, prices, built-in 7-day trial, change timing, grace frozen** (PRODUCT.md, DEC-072–082, DEC-093). Stripe/Apple checkout, webhooks, portal, and interval-change execution remain open |
| Configurable fields | Product direction approved; structure not started |
| GroupMembership overrides | Explicit name/email/photo/identifier/PIN overrides implemented in the Member/Group slice; generic field engine still not started |
| Organization role permissions | Owner is the paying User; admin/staff are WorkspaceStaffAccount. **Admin matrix frozen (DEC-070). Staff matrix frozen (DEC-071).** |

---

## Consistency With Other Documents

This document must remain consistent with:

- [PRODUCT.md](./PRODUCT.md) — product behavior and concepts
- [TERMINOLOGY.md](./TERMINOLOGY.md) — canonical terms
- [DECISIONS.md](./DECISIONS.md) — confirmed and open decisions
- [MVP.md](./MVP.md) — scope boundaries

When this document and another authoritative file conflict, **stop and resolve the conflict explicitly** rather than silently changing product behavior.

---

## Document Status

| Field | Value |
|-------|-------|
| **Status** | Tenant/person foundation; Organization owner + WorkspaceStaffAccount + Member/Group slice implemented; V1 entitlement layer, internal billing domain, and Stripe-ready provider/UI boundary implemented (live Stripe credentials and Apple IAP still open); public Status service, API-first Docs/legal Content API, public Contact API, and Docs Support hub implemented |
| **Last updated** | 2026-08-26 |
| **Next architecture work** | Production domain family implementation (DNS/Nginx/cookies/CORS — DEC-088 / OPEN-029); Connect Stripe TEST credentials; interval-change product decision; real ad provider at deployment; Events / Action Records as otherwise prioritized |
