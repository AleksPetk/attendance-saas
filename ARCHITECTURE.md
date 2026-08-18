# Technical Architecture

Technical architecture source of truth for the Configurable Check-In / Attendance SaaS Platform.

For product behavior, see [PRODUCT.md](./PRODUCT.md). For terms, see [TERMINOLOGY.md](./TERMINOLOGY.md). For decisions, see [DECISIONS.md](./DECISIONS.md). For MVP boundaries, see [MVP.md](./MVP.md).

This document describes **approved conceptual architecture** only. It does **not** define Django models, database fields, API endpoints, or implementation details unless explicitly noted as future work.

---

## Scope of This Document

### Approved in this document

The **tenant and person foundation**:

- global **User**
- **Organization** as the tenant boundary
- **OrganizationMembership** linking User ↔ Organization
- fixed MVP Organization roles: **owner**, **admin**, **staff**
- **Member** owned by one Organization
- **Group** owned by one Organization
- **GroupMembership** linking Member ↔ Group
- **GroupOnlyParticipant** scoped to one Group

Cross-cutting rules for tenant isolation, data ownership, and historical integrity that apply to this foundation.

### Explicitly not designed here

Do not infer implementation from this document for:

- Django models, fields, or migrations
- REST/API design
- Events and Event Entries
- Actions and Action Records
- Kiosks
- subscriptions and billing
- configurable fields and group-specific overrides (structure only noted as future)
- notification engine
- platform-operator administration tooling

Those areas require separate architecture work and approval.

---

## Architectural Overview

The platform separates three concerns:

1. **Who can log in and manage** — **User** (human login account)
2. **Which customer workspace they access** — **Organization** via **OrganizationMembership**
3. **Who is tracked operationally inside a workspace** — **Member**, **GroupOnlyParticipant**, and later **Event Entry**

**Organization** is the customer **workspace**, **tenant boundary**, and **subscription owner**. The real-world legal form of the customer (company, school, gym, sole proprietor, etc.) does not change the platform model.

**User** is a human login account. A **customer User** accesses **exactly one** Organization workspace through **OrganizationMembership**. Customer Users do not switch Organizations in one login. If the same real person manages two separate customer businesses/workspaces, they use **separate User accounts**. Platform operators may use the same `accounts.User` model with platform-admin access flags (`is_staff` / `is_superuser`) for Django admin and future platform tooling — this is global, separate from customer Organization membership, and is **not** Organization customer roles.

**Member** is a tracked person inside an Organization and generally does **not** need a User login. The same real-world person may simultaneously be a staff **User** and a **Member**, but those remain **separate records and lifecycles** with no required link between them (explicit linking, if any, remains a later decision).

```
Platform
  └── User (global human login account)
        ├── (optional) platform operator access via is_staff / is_superuser
        └── at most one active customer OrganizationMembership
              └── role: owner | admin | staff

  └── Organization (customer workspace / tenant / subscription owner)
        ├── Member (tracked person profile; no login required)
        │     └── GroupMembership (per Group)
        ├── Group
        │     ├── GroupMembership (linked Members)
        │     └── GroupOnlyParticipant
        └── (future) Event → Event Entry
```

Operational customer data belongs to **Organizations**, not directly to Users. Customer Users access and manage Organization data only through their **OrganizationMembership**. **Subscriptions** belong to the Organization workspace, not to Members.

---

## Entities

### User

A **User** is a global **human login account** for people who authenticate to the SaaS application.

- Exists at platform scope as a login identity
- A **customer User** has **at most one active customer OrganizationMembership** and therefore belongs to **at most one Organization**
- Customer Users do **not** switch between Organizations in one login
- If the same real person manages two separate customer businesses/workspaces, they use **separate User accounts** for those Organizations
- Is **not** a Member, GroupOnlyParticipant, or Event Entry person
- The same real-world person may also have a **Member** record in an Organization, but User and Member remain separate entities with separate lifecycles

**Platform operator accounts** use the same User model. Django `is_staff` / `is_superuser` are global platform-operator flags. They remain separate from customer Organization membership and are **not** Organization customer roles. Platform operators do not access customer workspaces through OrganizationMembership.

### Organization

An **Organization** is the customer **workspace**, **tenant boundary**, and **subscription owner**.

- Owns all operational customer data within that tenant
- Is an isolated customer tenant; the real-world legal form of the customer (company, school, gym, individual business, etc.) does not change the platform model
- Billing and **Subscription** belong to the Organization workspace, separate from Member identity
- All Members, Groups, GroupMemberships, and GroupOnlyParticipants belong to exactly one Organization
- Cross-Organization relationships are **forbidden**
- Has **exactly one primary owner** User (via OrganizationMembership with role **owner**); may also have additional Users with **admin** or **staff** roles

### OrganizationMembership

An **OrganizationMembership** is the relationship/role entity linking one **customer User** to one **Organization** workspace.

- Expresses that a customer User can log in and access/manage that Organization
- Carries the User’s **role** within that Organization (**owner**, **admin**, or **staff**)
- A customer User may have **at most one active OrganizationMembership**
- Customer Users do not switch Organizations in one login
- Each Organization has **exactly one primary owner** User; additional admin/staff Users may be added with roles and permissions defined later (e.g. launch kiosk, add Members)
- Platform operator accounts (`is_staff` / `is_superuser`) are **not** customer OrganizationMemberships

#### MVP Organization roles

Fixed MVP roles on OrganizationMembership:

| Role | Purpose (high level) |
|------|----------------------|
| **owner** | Primary Organization owner; highest-level Organization control |
| **admin** | Organization administration |
| **staff** | Organization staff access with more limited management scope (exact capabilities undecided) |

Exact capability differences between roles remain to be defined. This document approves the **role names and the OrganizationMembership model**, not a full permission matrix.

### Member

A **Member** is a reusable canonical person profile **owned by exactly one Organization**.

- Represents a **tracked person** inside the Organization workspace
- Generally does **not** require a User login
- Contains Organization-level data configured for that person
- Is **not** a User and must not be merged into the User model
- May belong to **multiple Groups** within the same Organization via GroupMembership
- Must not be shared across Organizations
- Must not be duplicated per Group

The same real-world person may also be a staff **User** (e.g. a teacher who launches a kiosk and has their own attendance tracked). User and Member records remain **separate**. Disabling or removing staff **User** access must **not** destroy that person’s **Member** attendance history.

Which Member fields are required is not defined here (see open questions in [DECISIONS.md](./DECISIONS.md)).

### Group

A **Group** is an Organization-defined participation context **owned by exactly one Organization**.

- Examples: Employees, Students, Morning Class
- Contains GroupMemberships and GroupOnlyParticipants
- Must not span Organizations

Group-specific configuration (fields, actions, kiosks, notifications) is product-defined but not architecturally designed in this document.

### GroupMembership

A **GroupMembership** links one **Member** to one **Group**.

- Both Member and Group must belong to the **same Organization**
- Is a real domain entity, not an implicit join table only
- May later hold group-specific data overrides that do not modify the Member’s canonical Organization-level data
- Override structure and configurable fields are **not designed here**

A Member may have multiple GroupMembership records within one Organization.

### GroupOnlyParticipant

A **GroupOnlyParticipant** is a participant scoped to **exactly one Group**.

- Exists without a reusable Organization **Member** profile
- Is **not** a User
- Is **not** a reusable Member
- Belongs to the same Organization as its Group
- Useful for temporary or lightweight participation

Future linking or conversion to a Member is a product decision, not defined here.

---

## Relationship Rules

| Rule | Requirement |
|------|-------------|
| User ≠ Member | Login accounts and tracked person profiles are separate concepts, even for the same real-world person |
| No required User ↔ Member link | The same person may exist as both User and Member without an explicit link; any linking mechanism remains undecided |
| Staff login lifecycle ≠ Member lifecycle | Disabling or removing a staff User must not destroy that person’s Member attendance history |
| Operational data ownership | Customer operational data belongs to Organizations, not directly to Users |
| Subscription ownership | Subscriptions belong to the Organization workspace, not to Members |
| Customer User ↔ Organization | At most one active OrganizationMembership per customer User |
| Organization primary owner | Each Organization has exactly one primary owner User; additional admin/staff Users may exist |
| No customer org switching | Customer Users do not switch Organizations in one login |
| Separate businesses, separate User accounts | The same real person managing two Organizations uses two User accounts |
| Member ↔ Organization | Many-to-one; one Member, exactly one Organization |
| Group ↔ Organization | Many-to-one; one Group, exactly one Organization |
| Member ↔ Group | Many-to-many via GroupMembership, within one Organization |
| GroupOnlyParticipant ↔ Group | Many-to-one; scoped to one Group (and therefore one Organization) |
| Cross-Organization links | Forbidden across all entity types in this foundation |
| Platform admin ≠ Organization roles | Django `is_staff` / `is_superuser` are platform-operator flags, not OrganizationMembership roles |

---

## Tenant Isolation

Tenant isolation is **non-negotiable**.

Organization A must never access Organization B’s data, including Members, Groups, GroupMemberships, GroupOnlyParticipants, and all future Organization-scoped entities.

Enforcement must occur at:

1. **Application level** — authorization, query scoping, and service boundaries always constrain access by Organization
2. **Database level where practical** — schema design, constraints, and query patterns should make cross-tenant access difficult or impossible, not merely discouraged

Tenant isolation applies to customer Users through OrganizationMembership: a customer User may only access the Organization they currently belong to, and only when they have a valid active membership in that Organization.

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

### No multi-Organization customer User

Do **not** design customer login, session, or dashboard around switching Organizations. A customer User belongs to at most one Organization. Multi-workspace operators use separate User accounts.

---

## Historical Integrity and Deletion

This foundation participates in the platform’s historical integrity rules:

- Once operational records have dependent history (for example, future Action Records), prefer **archive** or **deactivate** over destructive deletion where appropriate
- Do not silently overwrite or manipulate records in a way that destroys historical integrity
- Action Record creation, correction, and audit mechanics are **not designed here**

Exact deletion, archival, and deactivation behavior for Members, Groups, GroupMemberships, and GroupOnlyParticipants will be defined when Actions and Action Records are architected.

---

## Deferred Architecture

The following are confirmed **product concepts** but intentionally **excluded from this architecture document**:

| Area | Status |
|------|--------|
| Event / Event Entry | Product concept approved; architecture not started |
| Action / Action Record | Product concept approved; architecture not started |
| Kiosk / Kiosk Session | Product concept approved; architecture not started |
| Subscriptions / Plans | Product direction approved; architecture not started |
| Configurable fields | Product direction approved; structure not started |
| GroupMembership overrides | Entity approved; override implementation not started |
| Organization role permissions | Role names approved; capability matrix not started |

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
| **Status** | Approved foundation (tenant/person layer only) |
| **Last updated** | 2026-08-18 |
| **Next architecture work** | Organization + OrganizationMembership database/API design, then Member/Group foundation |
