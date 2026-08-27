# Getting Started with CheckStation

This guide is the shortest useful path from a new CheckStation account to a first successful check-in. It matches the current product. It is documentation, not the Website **Get started** registration button.

You will: create an account, create a Group, add people, configure and launch a kiosk, record a test action, then review History.

## 1. Create your CheckStation account

1. Open **Get started** on the CheckStation website (or go to `/register`).
2. Enter **Email**, **Password**, and **Confirm password**. First and last name are optional.
3. Choose **Create account**.

Your workspace is created automatically with **Business included for 7 days** (no card). Email verification is required before you can use the workspace. After registration you land on **Check your email**.

Open the verification link (it expires in 24 hours). Use **Resend verification email** if needed. After verification, continue to Check Station or sign in at **Login**.

> Owners sign in with email and password. Workspace staff use a different screen later: **Staff login** (Workspace ID + username + password).

## 2. Your workspace

After a successful owner sign-in you land on **Dashboard**. The workspace sidebar is:

- **Dashboard**
- **Members**
- **Groups**
- **History**
- **Staff** (Plus and Business; locked on Basic)
- **Account** (owner only)

There is no Events area in the current product. Each paying owner has exactly one workspace.

## 3. Members and Groups

**Members** are reusable people in the workspace. They do not log in.

**Groups** are the check-in contexts. Each Group owns its own kiosk. People take part in a Group as:

- an existing **Member** added to that Group, or
- a **Visitor** (Group-only participant) who exists only in that Group (or Class, for Structured Groups)

Attendance PINs and Group Participant Codes belong to participation in the Group, not to the Member profile.

## 4. Create the first Group

1. Open **Groups**.
2. Choose **Create Group**.
3. Name the Group.
4. Choose type:
   - **Standard Group** — participants belong directly to the Group. Available on every plan.
   - **Structured Group** — participants sit in Classes/Sections. **Business** only. Type cannot be changed after create.
5. Choose **Create Group**.

Plan limits apply to how many active Groups you can keep. Basic allows a small number of Standard Groups and does not include Structured Groups.

For a first test, use a **Standard Group**.

## 5. Add Members or participants

You can add reusable Members first, or add people only on the Group.

### Optional: create a Member

1. Open **Members** → **Add Member**.
2. Enter **Name** (required). Email, date of birth, phone, address, photo, and notes are optional.
3. Choose **Create Member**.

### Add people to the Group

1. Open the Group.
2. In **Participants**:
   - **Add existing Member**, or
   - **Add Visitor** for someone who should exist only in this Group.
3. If the Group requires email or PIN, fill **Group email** and **Group PIN** on the participation record. Those values are for this Group, not a login password.

Check Station assigns a **Group Participant Code** automatically (used by the kiosk). You do not invent that code.

## 6. Configure Group behavior

On the Group, choose **Edit configuration**.

**Actions**

- **Check-in**
- **Check-out**
- **Breaks** (optional). If on, set **Maximum breaks** to 1, 2, or 3.

Turn on at least **Check-in** for a first test.

**Participation**

- **Require email** — participants need a Group email.
- **Require PIN** — participants need a Group PIN.
- Structured Groups also have **Require PIN for classes**.

Keep requirements off for the fastest first test unless you want to practice those fields.

Save with **Save Group**.

## 7. Identification requirements

Identification is configured in two places:

1. **Group** — whether email and PIN are required at all.
2. **Kiosk Settings** — how the kiosk asks for them (card vs input, which fields show).

Open **Kiosk Settings** from the Group.

For a Standard Group you choose kiosk type **Card** or **Input**.

- **Card**: show **Name**, **Group Participant Code**, and/or **Email** on cards. Optional **Require PIN after card selection**.
- **Input**: Field 1 is always **Group Participant Code**. Field 2 can be Name, Email, or PIN when the Group allows it.

You must set a **Kiosk Exit Code** (4–10 letters or numbers) before the Group is ready to launch. Confirm it. Status should read **Exit code configured**.

Save with **Save Kiosk Settings**. If the Group shows **Setup incomplete** or **Kiosk settings need attention**, finish those items before launch.

## 8. Open Kiosk Builder

From the Group, choose **Edit Kiosk Design**. That opens **Kiosk Builder** (`/groups/{id}/kiosk-builder`).

The canvas **is** the preview. There is no separate Preview button.

## 9. Choose a kiosk design

The editor has tabs **Header**, **Main**, **Footer**, and **Cards** or **Input** (from Kiosk Settings). Structured Groups always use **Cards**.

Typical first-run choices:

- Header **Title** and optional logo
- Main background (solid, gradient, or image)
- A **Card template** or **Input template**

Every plan includes the full template catalog. Templates are not plan-locked.

See [Kiosk Setup](/kiosk-setup) for Header/Main/Footer, backgrounds, zoom/pan, undo/redo, and save/cancel.

## 10. Preview the kiosk

Watch the live canvas while you edit. On the Cards tab, **Test participants** are fake editor-only people (not saved Members). Use them to judge card density. They are not a live check-in.

## 11. Save the kiosk

Use **Save** in the editor. Status shows **Unsaved**, **Saving…**, or **Saved**.

**Cancel** asks **Discard unsaved kiosk design changes?** Leaving the page with unsaved work also warns you.

Save stores the design on this Group. There is no autosave.

## 12. Launch the live kiosk

Back on the Group, choose **Launch Kiosk**. That opens the live kiosk and **locks this browser session** so the workspace dashboard is not available to participants.

Launch is blocked until Group setup and Kiosk Settings are ready (participants complete, exit code set, identification valid). Plan-locked Groups cannot launch.

On Basic, you may see an ad **before** launch. Ads are not shown during the live participant kiosk.

The live screen may show **Loading kiosk…** briefly.

## 13. Perform a test check-in or check-out

On a Standard **Card** kiosk:

1. Select the test participant.
2. Enter PIN if you required it.
3. On **Choose action**, pick **Check in** (or **Check out** / **Start break** / **End break** if those actions are enabled and available).
4. Wait for the confirmation screen. It returns after the delay set in Kiosk Settings (1, 3, or 5 seconds).

On **Input**, enter the Group Participant Code (and Field 2 if configured), then continue to the action.

Each successful action creates an **Action Record**. That is the history, not a live dashboard rewrite.

## 14. Exit the kiosk

1. Choose **Exit**.
2. In **Exit kiosk**, enter this Group’s **Exit code**.
3. Confirm **Exit kiosk**.

Exit uses the kiosk exit code only — not the owner password. After a successful exit you return to the workspace. On Basic you may see an ad after exit.

If this browser is already locked, use **Unlock session** with the same exit code.

## 15. Review History

Open **History**.

- **Activity Log** — recent check-in, check-out, and break actions. Filter by Group, action, and date.
- **Attendance Report** — build a report for one Group.

**Export** (PDF, Excel, CSV) requires **Plus** or **Business**. On Basic the control shows **Export locked**.

## 16. Optional: email notifications

On **Edit configuration** → **Advanced**, configure an **Email sender** (Custom SMTP, Gmail, Outlook / Microsoft 365, or Yahoo Mail). Use **Send test**, then **Save sender**.

When the sender is ready, you can enable **After check-in**, **After check-out**, and **After break**, and edit the message (`{name}`, `{time}`, `{group}`).

After-action mail goes to the participant’s **Group email**, not automatically to the Member profile email. **Forward emails** (private copies) require Plus or Business.

You can skip email entirely for a first check-in.

## 17. Optional: workspace staff

**Staff** accounts are **Plus** and **Business** only. Basic shows Staff as locked.

The owner creates logins on **Staff**: username, role (Admin or Staff), password, and email (required for Admin). Copy the **Workspace ID**. Staff sign in at **Staff login** with Workspace ID + username + password. Staff can be limited to specific Groups.

The owner still signs in with email and password and does not use Workspace ID.

## 18. Subscription and billing

The owner opens **Account**:

- **Security** — login email, backup email, password, 2FA, account deletion
- **Subscription** — current plan, usage, upgrades and downgrades
- **Billing** — invoices, receipts, payment details (Stripe for web checkout)

New workspaces include a **7-day Business trial** (no card). After that week, unpaid workspaces are **Basic** (free, with ads in specified workspace placements). Paid plans are Plus and Business. Changing plan does not delete existing data; it can lock increasing usage that exceeds the new plan.

## 19. Next

- [Groups & Members](/groups-members) — Members, Visitors, Groups, archive, and plan locks
- [Kiosk Setup](/kiosk-setup) — design, settings, launch, lock, and exit in detail
- [Billing & Plans](/billing-plans) — plans, prices, upgrades, and downgrades
- [FAQ](/faq) — searchable short answers
- [Privacy Policy](/privacy-policy) — how Check Station handles workspace and participant data
- [Terms of Use](/terms-of-use) — the agreement for using Check Station
