# Groups & Members

This guide explains how people and check-in contexts work in CheckStation today. It is a practical workspace guide, not a database reference.

> Members are people records. Groups are the places those people check in. Attendance history is stored as Action Records and is not deleted when you archive or remove a person.

## 1. Understanding Members

A **Member** is a reusable person record in your workspace. Members do not log in, do not get a workspace password, and are not the same as the owner account or a Staff/Admin login.

Name is the only required Member field. Email, date of birth, phone, address, photo, and notes are optional.

Create Members when the same person should appear in more than one Group, or when you want a lasting workspace profile. You do not have to create a Member before someone can participate in a Group.

## 2. Understanding Groups

A **Group** is a long-lived check-in context. It is not a folder of people. Each Group owns its own kiosk, its own participation list, and its own attendance settings.

When you create a Group you choose a type:

- **Standard** — people belong directly to the Group
- **Structured** — people belong to **Classes** inside the Group (**Business** plan)

Type cannot be changed later.

## 3. Member vs participant

These are different things:

**Member**
= a reusable person record in the workspace

**Participant**
= that person's participation inside a particular Group (or Class)

Participation is where Group-specific data lives: Group Participant Code, Group email addresses, Group PIN, and optional Group-only photo/name overrides.

A person can be:

- a **Member added to the Group**, or
- a **Visitor** (Group-only participant) who exists only in that Group

Attendance PINs and Group Participant Codes belong to participation, not to the Member profile.

## 4. Standard Groups

Standard Groups are available on every plan. Participants sit directly on the Group. There are no Classes.

Use a Standard Group for a single roster: a team, a class that does not need sub-groups, a shift, or a simple check-in list.

Plan limits apply to how many **active** Standard Groups you can keep, how many **Members** the workspace can keep, and how many **participants** one Standard Group can hold. See [Billing & Plans](/billing-plans).

## 5. Structured Groups

Structured Groups are a **Business** entitlement. Participants must belong to a **Class** (the product name for a section inside the Group).

Use a Structured Group when one Group should contain several Classes that share one kiosk flow: choose class, then choose person, then choose action.

Plus and Basic cannot create Structured Groups. If you later leave Business, existing Structured Groups are **plan-locked**, not deleted.

Business can also import a Standard Group snapshot into a Class. That copies people into the Class. It does not copy kiosk design or attendance history.

## 6. Classes inside Structured Groups

Classes live only inside Structured Groups.

- A Class has a name unique among **active** Classes in that Group
- Participants in a Structured Group must be assigned to a Class
- Classes can be archived, restored, or permanently deleted after archive
- Attendance history stays on the Group; class name at the time of the action is kept on the Action Record

**Require PIN for classes** (optional) asks for a Class PIN on the live kiosk before the participant list for that Class.

> There is currently no workspace screen for moving a person from one Class to another. Assign the Class when you add the participant.

## 7. Creating a Member

1. Open **Members**.
2. Choose **Add Member**.
3. Enter **Name**.
4. Optionally add email, date of birth, phone, address, photo, and notes.
5. Choose **Create Member**.

The Member appears in the workspace Members list. They are not in any Group until you add them.

Staff accounts cannot use the global Members directory. Owner and Admin can.

## 8. Editing Member information

Open an **active** Member to edit profile fields. Archived Members cannot be opened or edited until restored.

Member profile email is a workspace contact field. It can prefill Group participation email when you add the Member to a Group. Editing the Member later does **not** change Group emails already stored on participation.

## 9. Member IDs

Each Member has a visible **Member #** ID (the workspace record number). That ID stays the same across archive and restore. It is not a kiosk login and is not a Group Participant Code.

## 10. Duplicate names

Names are **not unique**. Two Members can both be named "Alex Kim". Use optional email, notes, photo, or the Member # ID to tell them apart. The kiosk can also use Group Participant Code or PIN when names collide.

## 11. Member photos

Photo is optional on the Member profile. A Group participation record can also store its own photo for that Group. Profile photo and Group photo are separate.

## 12. Member email and contact fields

Optional Member fields:

- Email
- Phone
- Address
- Date of birth
- Notes

These are workspace profile data. They are **not** login credentials.

Group after-action emails use **participation emails** on the Group (up to three addresses), not the Member profile email, unless you copied the profile email into participation when adding the person.

## 13. Adding a Member to a Group

1. Open the Group.
2. In **Participants**, choose **Add existing Member**.
3. Select the Member.
4. For Structured Groups, choose a Class.
5. Fill Group email and Group PIN if the Group requires them.
6. Save.

CheckStation assigns a **Group Participant Code** automatically (`G{group id}-{4 digits}`). You do not invent that code. Once assigned, it stays the same for that participation.

A Member can belong to more than one Group. Each Group has its own participation record.

## 14. Removing a Member from a Group

Removing a Member from a Group **deactivates** that Group membership. The Member record stays in the workspace. Action Records for past check-ins stay in History.

This is not the same as archiving the Member, and it is not the same as deleting the Group.

## 15. Group-specific participation

On a Group you can set:

- **Require email** — each operational participant needs at least one Group participation email
- **Require PIN** — each operational participant needs a Group PIN
- Check-in / check-out / breaks and related kiosk settings
- After-action emails and (on entitled plans) Forward Emails

If requirements are on but some people are missing email or PIN, the Group is **setup incomplete**. You can still save configuration. Real kiosk launch stays blocked until every operational participant meets the requirements.

## 16. Participation codes and PINs

**Group Participant Code** is assigned by CheckStation and is unique inside that Group. Use it on the kiosk when you identify by code.

**Group PIN** is a 4–12 character alphanumeric attendance code for that Group. It is a low-security check-in code, not a login password. Managers can set, change, or reset a Group PIN, but the product does not show an existing PIN after it is saved. The live kiosk list does not expose PINs.

Member-profile PIN/identifier fields are leftover compatibility fields. Do not treat them as the current way to identify people. Use Group participation PIN and Group Participant Code.

For Structured Groups, a **Class PIN** is separate from the participant PIN. It is used when **Require PIN for classes** is on. Managers can set, change, or reset a Class PIN, but cannot view the saved value afterward. A correct Class PIN unlocks the Structured Class kiosk step only; it does not grant a Staff account access to Groups they are not assigned to.

## 17. Email requirements

When **Require email** is on, every operational participant must have at least one participation email. You can store up to **three** participation addresses. All configured addresses can receive after-action messages for that person.

Member profile email is optional and independent. A Visitor can have participation emails without ever becoming a Member.

## 18. Check-in permissions and actions

Who can check in on a kiosk is the Group's **operational participants**: active Member memberships and active Visitors (and, for Structured Groups, people in an active Class).

Archived Members, inactive memberships, archived Visitors, archived Groups, and plan-locked Groups cannot be used for live check-in.

Enabled actions (check-in, check-out, breaks) are Group settings. Each performed action creates an **Action Record**. History is not only "currently present."

Owner and Admin can manage Groups workspace-wide. Staff can operate only Groups they are assigned to. See [Staff access](#29-staff-access-to-groups).

## 19. Visitors (lightweight participants)

A **Visitor** is a Group-only participant. They exist in that Group (or Class) and do not appear in the workspace Members directory.

Use a Visitor for a one-off person, a guest, or someone you do not want as a reusable Member yet.

> Converting a Visitor into a Member is **not implemented**. If you later need a reusable Member, create a Member and add them to the Group. Do not expect an automatic merge.

## 20. Archiving Members

**Archive** is the normal way to stop using a Member.

An archived Member:

- cannot be opened or edited
- is operationally inactive in Groups and kiosks
- keeps the same Member # ID, profile, and Group attachments

You can **Restore** the Member, or **Permanently delete** only after archive. Permanent delete is not available on an active Member.

## 21. Archiving Groups

Archive a Group when you are done using it but want to keep the record.

An archived Group cannot be launched as a kiosk. You can restore it later (plan limits still apply) or permanently delete it after archive.

Archived Groups use a **separate** archived-Group quota. They do not consume the active Group limit.

## 22. Delete behavior

Permanent delete is a second step after archive.

**Permanent delete Member**
- removes the live Member
- removes memberships
- keeps Action Records (the live Member link is cleared)

**Permanent delete Group**
- removes the Group, memberships, Visitors, Classes, and kiosk design
- keeps Action Records

**Permanent delete Class**
- removes Class participation rows
- keeps Action Records on the Group, including the class name snapshot from the time of the action

There is no undo after permanent delete. Archive first if you might need the record.

## 23. Attendance and history preservation

Every performed Action creates an Action Record. Archiving or deleting people and Groups does not rewrite those historical rows to hide that something happened.

History and Attendance Reports remain the place to read past activity. Manual correction of history is a separate future workflow; do not overwrite records to "fix" the past.

## 24. Plan limits

Current workspace limits depend on Basic, Plus, or Business. Limits include:

- active Standard Groups
- active Structured Groups (Business)
- archived Groups
- Members
- participants per Standard Group
- Classes per Structured Group, and participants per Class (Business)
- Admin and Staff seats

Exact numbers are published in [Billing & Plans](/billing-plans) and come from the same plan catalog the product uses.

If you are at a limit, you cannot create or reactivate another resource of that kind until you reduce usage or change plan.

## 25. Plan-locked Members

After a downgrade, Members above the new Member limit stay in the workspace but become **plan-locked**.

Plan-locked Members remain visible in the Members list. You cannot open, edit, or add them to Groups until enough other Members are archived or you return to a plan that covers them.

CheckStation does **not** auto-delete extra Members to fit the new plan.

## 26. Plan-locked Groups

Groups above the new active (or archived) limit, and Structured Groups on a plan that does not include Structured Groups, become **plan-locked**.

A plan-locked Group cannot be opened for configuration or launched as a kiosk. It is not deleted. Reduce usage or upgrade to unlock it.

A **scheduled** downgrade does not lock Groups while you are still on the current paid plan. Locks apply when the effective plan actually changes.

## 27. What happens after downgrade

- Existing Members, Groups, Visitors, Classes, and Action Records remain
- Nothing is auto-deleted to force the new limits
- Creation, restore, and configuration that would increase over-limit usage is blocked
- Extra resources show as plan-locked
- You can archive extra items, or upgrade, to continue editing them

## 28. Standard vs Structured plan availability

| Group type | Basic | Plus | Business |
| --- | --- | --- | --- |
| Standard | Yes | Yes | Yes |
| Structured | No | No | Yes |

Kiosk Card and Input templates are **not** plan-gated. Structured Groups, Classes, and Structured snapshot import are Business.

## 29. Staff access to Groups

**Staff** is Group-scoped.

Staff may, in assigned Groups:

- work with participants
- launch and exit the kiosk for those Groups
- view and export History / Attendance Reports for those Groups (export still requires a plan that includes exports)

Entering a correct Class PIN on a Structured kiosk does not bypass Staff Group assignment. Staff still cannot open unassigned Groups.

Staff cannot:

- open unassigned Groups
- use the global Members directory
- configure Group settings, kiosk design, or email sender
- manage Staff/Admin accounts or billing

Owner and Admin assign Staff to Groups. If a Staff account cannot log in, check Workspace ID, username, password, and that the account is active.

## 30. Admin access

**Admin** can manage Members, Groups, participation, kiosk configuration, email settings, History, and Staff accounts (`role=staff` only).

Admin cannot: billing, owner login security, creating other Admin accounts, ownership transfer, or permanent workspace deletion.

Plan limits still apply. An Admin on Plus cannot create a Structured Group even though their role would allow Group management.

The **owner** is the paying User. Owner has Admin capabilities plus billing and account security.

## 31. Common mistakes

- Treating a Group as a folder of Members — participation and kiosk live on the Group
- Expecting Member profile email/PIN to be the kiosk identity — use Group participation fields
- Creating a Structured Group on Plus — that type is Business only
- Assuming a scheduled downgrade immediately locks Groups — locks wait until the plan actually changes
- Removing a Member from a Group and thinking the Member was deleted
- Expecting a Visitor to become a Member automatically
- Trying to permanently delete an active Member or Group — archive first
- Giving Staff a global Members job — Staff is Group-scoped

## 32. Related docs

- [Getting Started](/getting-started) — first Group and test check-in
- [Kiosk Setup](/kiosk-setup) — launch, lock, exit code, Structured kiosk flow
- [Billing & Plans](/billing-plans) — limits, plan-lock, upgrades and downgrades
- [FAQ](/faq) — short answers on Members, Groups, and plan locks
- [Privacy Policy](/privacy-policy) — who controls Member data
