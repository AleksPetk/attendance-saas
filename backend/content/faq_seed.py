"""Canonical published FAQ entries. Create-if-missing; do not duplicate into frontends."""

from content.models import FaqCategory

FAQ_ENTRIES = (
    # Getting Started
    {
        "slug": "how-do-i-create-my-workspace",
        "question": "How do I create my workspace?",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "register, signup, account, workspace, get started",
        "related_document_slug": "getting-started",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "Open **Get started** on the CheckStation website (or go to `/register`). "
            "Enter email and password, then create the account. Your workspace is created "
            "automatically on **Basic**. Verify your email before you can use the workspace."
        ),
    },
    {
        "slug": "do-i-need-to-name-my-workspace",
        "question": "Do I need to name my workspace?",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "workspace name, organization name",
        "related_document_slug": "getting-started",
        "sort_order": 20,
        "answer": (
            "Registration creates the workspace automatically. You are not asked for a "
            "separate workspace name during signup. You work in that one workspace after "
            "you verify email and sign in."
        ),
    },
    {
        "slug": "where-do-i-create-my-first-group",
        "question": "Where do I create my first Group?",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "create group, first group, groups page",
        "related_document_slug": "getting-started",
        "featured": True,
        "sort_order": 30,
        "answer": (
            "Sign in as the owner, open **Groups**, then **Create Group**. Name it and "
            "choose Standard (every plan) or Structured (Business only). Type cannot be "
            "changed later. See [Getting Started](/getting-started)."
        ),
    },
    {
        "slug": "what-happens-after-i-register",
        "question": "What happens after I register?",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "verify email, check your email, confirmation",
        "related_document_slug": "getting-started",
        "sort_order": 40,
        "answer": (
            "You land on **Check your email**. Open the verification link (it expires in "
            "24 hours). Use **Resend verification email** if needed. After verification, "
            "continue to CheckStation or sign in at **Login**."
        ),
    },
    {
        "slug": "is-there-an-events-area",
        "question": "Is there an Events area?",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "events, event, one-time",
        "sort_order": 50,
        "answer": (
            "Not in the current product. Check-in contexts are **Groups**. Each paying "
            "owner has exactly one workspace."
        ),
    },
    {
        "slug": "how-do-i-record-a-test-check-in",
        "question": "How do I record a test check-in?",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "test check-in, first check-in, launch kiosk",
        "related_document_slug": "getting-started",
        "sort_order": 60,
        "answer": (
            "Create a Group, add at least one participant, finish Group and kiosk setup "
            "(including an exit code), then **Launch Kiosk**. Identify a person, choose "
            "an action, and confirm. Review it later in **History**."
        ),
    },
    {
        "slug": "what-is-on-the-workspace-sidebar",
        "question": "What is on the workspace sidebar?",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "dashboard, members, groups, history, staff, account",
        "sort_order": 70,
        "answer": (
            "Dashboard, Members, Groups, History, Staff (Plus and Business; locked on "
            "Basic), and Account (owner only)."
        ),
    },
    {
        "slug": "owners-vs-staff-login",
        "question": "Do owners and Staff use the same login screen?",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "staff login, owner login, workspace id",
        "related_document_slug": "getting-started",
        "sort_order": 80,
        "answer": (
            "No. Owners sign in with email and password on **Login**. Staff use **Staff "
            "login** with Workspace ID + username + password."
        ),
    },
    # Account & Security
    {
        "slug": "where-do-i-change-my-password",
        "question": "Where do I change my password?",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "password, security, owner account",
        "sort_order": 10,
        "answer": (
            "The owner opens **Account → Security**. Staff password resets are done by "
            "Owner/Admin on the Staff page, not in the owner Account area."
        ),
    },
    {
        "slug": "can-i-turn-on-2fa",
        "question": "Can I turn on two-factor authentication?",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "2fa, totp, two factor, security",
        "sort_order": 20,
        "answer": (
            "The owner can enable optional TOTP 2FA in **Account → Security**. Workspace "
            "Staff/Admin logins are separate accounts and do not use the owner 2FA setting."
        ),
    },
    {
        "slug": "what-is-backup-email",
        "question": "What is backup email?",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "backup email, recovery, security",
        "sort_order": 30,
        "answer": (
            "The owner can set a backup email on **Account → Security**. It is for account "
            "recovery, not for Group after-action attendance emails."
        ),
    },
    {
        "slug": "can-i-delete-my-account",
        "question": "Can I delete my account?",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "delete account, danger zone, permanent deletion",
        "related_document_slug": "privacy-policy",
        "featured": True,
        "sort_order": 40,
        "answer": (
            "Yes. The owner can permanently delete the account and workspace from "
            "**Account → Security** (Danger Zone). This is not the same as cancelling a "
            "subscription. Cancellation stops paid renewal; deletion removes the workspace."
        ),
    },
    {
        "slug": "why-cant-i-use-the-workspace-yet",
        "question": "Why can't I use the workspace after registering?",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "email verification, unverified, check your email",
        "sort_order": 50,
        "answer": (
            "Email verification is required. Open the link from the verification email, "
            "or resend it from the check-your-email screen."
        ),
    },
    {
        "slug": "can-staff-change-owner-security",
        "question": "Can Staff change owner login or billing?",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "staff billing, owner security",
        "related_document_slug": "groups-members",
        "sort_order": 60,
        "answer": (
            "No. Billing, owner login email, password, 2FA, and account deletion are "
            "owner-only."
        ),
    },
    # Members & Groups
    {
        "slug": "what-is-a-member",
        "question": "What is a Member?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "member, person, profile",
        "related_document_slug": "groups-members",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "A Member is a reusable person record in your workspace. Members do not log "
            "in. Name is required; other profile fields are optional. See "
            "[Groups & Members](/groups-members)."
        ),
    },
    {
        "slug": "member-vs-participant",
        "question": "What is the difference between a Member and a participant?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "participant, membership, visitor",
        "related_document_slug": "groups-members",
        "featured": True,
        "sort_order": 20,
        "answer": (
            "A **Member** is the reusable workspace person. A **participant** is that "
            "person's participation in a particular Group (Group emails, PIN, and Group "
            "Participant Code). A Visitor is a participant who is not a Member."
        ),
    },
    {
        "slug": "can-two-members-have-the-same-name",
        "question": "Can two Members have the same name?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "duplicate names, same name, member id",
        "related_document_slug": "groups-members",
        "sort_order": 30,
        "answer": (
            "Yes. Names are not unique. Use Member # ID, optional email, photo, notes, "
            "or Group Participant Code / PIN on the kiosk to tell people apart."
        ),
    },
    {
        "slug": "what-happens-when-i-archive-a-member",
        "question": "What happens when I archive a Member?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "archive member, restore, inactive",
        "related_document_slug": "groups-members",
        "sort_order": 40,
        "answer": (
            "The Member cannot be opened or edited and is inactive in Groups and kiosks. "
            "The same ID, profile, and Group attachments remain. You can restore later, "
            "or permanently delete only after archive. Action Records are kept."
        ),
    },
    {
        "slug": "standard-vs-structured-groups",
        "question": "What is the difference between Standard and Structured Groups?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "structured, classes, standard group, business",
        "related_document_slug": "groups-members",
        "featured": True,
        "sort_order": 50,
        "answer": (
            "Standard Groups put participants directly on the Group (every plan). "
            "Structured Groups put participants in **Classes** inside the Group "
            "(**Business** only). Type is chosen at create and cannot be changed."
        ),
    },
    {
        "slug": "why-is-my-group-plan-locked",
        "question": "Why is my Group plan locked?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "plan locked, plan-locked, downgrade, locked group",
        "related_document_slug": "groups-members",
        "featured": True,
        "sort_order": 60,
        "answer": (
            "After a downgrade, Groups above the new limit (or Structured Groups on a "
            "plan that does not include them) stay in the workspace but cannot be opened "
            "or launched. Nothing is auto-deleted. Archive extra Groups or upgrade to "
            "unlock them."
        ),
    },
    {
        "slug": "what-happens-to-data-if-i-downgrade",
        "question": "What happens to my data if I downgrade?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "downgrade members, data deletion, plan lock",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 70,
        "answer": (
            "Records are not deleted. Extra Members and Groups become plan-locked. You "
            "cannot create or restore more items that would increase over-limit usage "
            "until you reduce usage or change plan."
        ),
    },
    {
        "slug": "what-is-a-visitor",
        "question": "What is a Visitor?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "visitor, group-only, lightweight participant",
        "related_document_slug": "groups-members",
        "sort_order": 80,
        "answer": (
            "A Visitor is a Group-only participant. They exist in that Group (or Class) "
            "and not in the Members directory. Converting a Visitor into a Member is not "
            "implemented yet."
        ),
    },
    {
        "slug": "how-do-group-participant-codes-work",
        "question": "How do Group Participant Codes work?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "participant code, g1-5679, identifier",
        "related_document_slug": "groups-members",
        "sort_order": 90,
        "answer": (
            "CheckStation assigns a code automatically in the form `G{group id}-{4 digits}` "
            "when someone is added to a Group. It is unique in that Group and stays the "
            "same. You do not invent it."
        ),
    },
    {
        "slug": "where-do-pins-live",
        "question": "Where do PINs live?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "pin, participation pin, attendance code",
        "related_document_slug": "groups-members",
        "sort_order": 100,
        "answer": (
            "Attendance PINs belong to **Group participation**, not the Member profile. "
            "A PIN is 4–12 letters or numbers. If the Group requires PIN, every "
            "operational participant needs one. Structured Groups can also require a "
            "Class PIN on the kiosk."
        ),
    },
    {
        "slug": "can-i-add-an-existing-member-to-a-group",
        "question": "Can I add an existing Member to a Group?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "add member, existing member, participants",
        "related_document_slug": "groups-members",
        "sort_order": 110,
        "answer": (
            "Yes. Open the Group → Participants → **Add existing Member**. For Structured "
            "Groups, choose a Class. Fill Group email/PIN if the Group requires them."
        ),
    },
    {
        "slug": "does-removing-a-member-from-a-group-delete-them",
        "question": "Does removing a Member from a Group delete them?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "remove from group, deactivate membership",
        "related_document_slug": "groups-members",
        "sort_order": 120,
        "answer": (
            "No. Removal deactivates that Group membership. The Member stays in the "
            "workspace. Past Action Records stay in History."
        ),
    },
    {
        "slug": "are-member-emails-required",
        "question": "Are Member emails required?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "require email, participation email, member email",
        "related_document_slug": "groups-members",
        "sort_order": 130,
        "answer": (
            "Not on the Member profile. If a Group has **Require email** on, each "
            "operational participant needs at least one **Group participation email** "
            "(up to three addresses)."
        ),
    },
    {
        "slug": "can-i-change-group-type-later",
        "question": "Can I change a Group from Standard to Structured later?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "immutable type, convert group",
        "related_document_slug": "groups-members",
        "sort_order": 140,
        "answer": (
            "No. Type is immutable after create. Business can import a Standard Group "
            "snapshot into a Class of a Structured Group; that does not convert the "
            "original Group or copy history/kiosk design."
        ),
    },
    {
        "slug": "how-do-i-permanently-delete-a-member",
        "question": "How do I permanently delete a Member?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "permanent delete, delete member",
        "related_document_slug": "groups-members",
        "sort_order": 150,
        "answer": (
            "Archive first. Permanent delete is not available on an active Member. After "
            "permanent delete, Action Records remain readable and the live Member link is "
            "cleared."
        ),
    },
    {
        "slug": "what-is-member-number",
        "question": "What is Member #?",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "member id, member number, display id",
        "related_document_slug": "groups-members",
        "sort_order": 160,
        "answer": (
            "It is the visible workspace ID for that Member record, shown as **Member #** "
            "plus the number. It is not a kiosk login and not a Group Participant Code."
        ),
    },
    # Kiosk
    {
        "slug": "how-do-i-launch-a-kiosk",
        "question": "How do I launch a kiosk?",
        "category": FaqCategory.KIOSK,
        "keywords": "launch kiosk, start kiosk",
        "related_document_slug": "kiosk-setup",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "Open the Group, finish setup, save a kiosk **exit code**, then **Launch "
            "Kiosk**. See [Kiosk Setup](/kiosk-setup)."
        ),
    },
    {
        "slug": "why-cant-i-launch-my-kiosk",
        "question": "Why can't I launch my kiosk?",
        "category": FaqCategory.KIOSK,
        "keywords": "setup incomplete, launch disabled, exit code required",
        "related_document_slug": "kiosk-setup",
        "featured": True,
        "sort_order": 20,
        "answer": (
            "Common causes: setup incomplete (missing required email/PIN, or a Structured "
            "Group has no Class with people), no exit code, invalid kiosk settings, "
            "archived or plan-locked Group, missing permission, or this browser is already "
            "in a locked kiosk session."
        ),
    },
    {
        "slug": "can-i-change-kiosk-design-later",
        "question": "Can I change the kiosk design later?",
        "category": FaqCategory.KIOSK,
        "keywords": "kiosk builder, templates, edit design",
        "related_document_slug": "kiosk-setup",
        "sort_order": 30,
        "answer": (
            "Yes. Reopen **Edit Kiosk Design** from the Group at any time. You can edit "
            "design even when launch is still blocked. Templates are available on every plan."
        ),
    },
    {
        "slug": "how-does-kiosk-lock-work",
        "question": "How does kiosk lock work?",
        "category": FaqCategory.KIOSK,
        "keywords": "kiosk lock, locked session, kiosk_locked",
        "related_document_slug": "kiosk-setup",
        "sort_order": 40,
        "answer": (
            "After a real launch, this browser session is locked to that Group kiosk so "
            "it cannot open the workspace dashboard. Exit with the Group **exit code** "
            "(not the owner password)."
        ),
    },
    {
        "slug": "how-do-kiosk-pins-work",
        "question": "How do PINs work on a kiosk?",
        "category": FaqCategory.KIOSK,
        "keywords": "pin, class pin, participant pin, exit code",
        "related_document_slug": "kiosk-setup",
        "sort_order": 50,
        "answer": (
            "If the Group requires PIN, the person enters their **Group participation PIN** "
            "when identifying. Structured Group kiosks can also ask for a **Class PIN** "
            "before showing that Class's people. The kiosk **exit code** is different: it "
            "unlocks the staff/admin session, not a participant check-in."
        ),
    },
    {
        "slug": "can-i-use-a-kiosk-on-a-tablet",
        "question": "Can I use a kiosk on a tablet?",
        "category": FaqCategory.KIOSK,
        "keywords": "tablet, ipad, mobile browser, kiosk device",
        "related_document_slug": "kiosk-setup",
        "sort_order": 60,
        "answer": (
            "Yes. Launch the Group kiosk in a browser on the tablet. Dedicated iOS/Android "
            "kiosk apps are not part of the current product. Keep the tab in live kiosk; "
            "exit with the exit code when you need the workspace again."
        ),
    },
    {
        "slug": "are-kiosk-templates-plan-gated",
        "question": "Are kiosk templates limited by plan?",
        "category": FaqCategory.KIOSK,
        "keywords": "templates, card, input, basic",
        "related_document_slug": "kiosk-setup",
        "sort_order": 70,
        "answer": (
            "No. Card and Input templates are available on Basic, Plus, and Business. "
            "Basic still shows ads around launch/exit and in workspace banners."
        ),
    },
    {
        "slug": "can-i-turn-off-kiosk-header-footer",
        "question": "Can I turn off the kiosk Header or Footer?",
        "category": FaqCategory.KIOSK,
        "keywords": "header, footer, builder",
        "related_document_slug": "kiosk-setup",
        "sort_order": 80,
        "answer": (
            "No. Header and Footer cannot be turned off. You can still change their content "
            "in Kiosk Builder."
        ),
    },
    {
        "slug": "is-the-builder-the-live-kiosk",
        "question": "Is Kiosk Builder the live kiosk?",
        "category": FaqCategory.KIOSK,
        "keywords": "preview, canvas, fake sample",
        "related_document_slug": "kiosk-setup",
        "sort_order": 90,
        "answer": (
            "No. The builder canvas is a preview (including sample content when setup is "
            "incomplete). Live attendance happens only after **Launch Kiosk**."
        ),
    },
    {
        "slug": "who-owns-the-kiosk",
        "question": "Who owns the kiosk?",
        "category": FaqCategory.KIOSK,
        "keywords": "group-owned kiosk, workspace kiosk",
        "related_document_slug": "kiosk-setup",
        "sort_order": 100,
        "answer": (
            "Each Group owns its own kiosk. There is no separate workspace kiosk that you "
            "assign to arbitrary Groups."
        ),
    },
    # Attendance
    {
        "slug": "where-do-i-see-attendance-history",
        "question": "Where do I see attendance history?",
        "category": FaqCategory.ATTENDANCE,
        "keywords": "history, action record, attendance report",
        "related_document_slug": "getting-started",
        "sort_order": 10,
        "answer": (
            "Open **History**. Each performed action creates an **Action Record**. Reports "
            "can be exported on Plus and Business."
        ),
    },
    {
        "slug": "are-records-deleted-when-i-archive-someone",
        "question": "Are attendance records deleted when I archive someone?",
        "category": FaqCategory.ATTENDANCE,
        "keywords": "history preservation, action records, archive",
        "related_document_slug": "groups-members",
        "sort_order": 20,
        "answer": (
            "No. Archiving or removing a participant keeps Action Records. Permanent delete "
            "clears the live person link but does not erase the historical row."
        ),
    },
    {
        "slug": "can-i-export-attendance",
        "question": "Can I export attendance?",
        "category": FaqCategory.ATTENDANCE,
        "keywords": "export, csv, xlsx, pdf, reports",
        "related_document_slug": "billing-plans",
        "sort_order": 30,
        "answer": (
            "Plus and Business can export Attendance Reports as CSV, Excel (.xlsx), and "
            "PDF. Basic can view reports in the workspace but cannot export those files."
        ),
    },
    {
        "slug": "does-check-in-overwrite-history",
        "question": "Does a new check-in overwrite history?",
        "category": FaqCategory.ATTENDANCE,
        "keywords": "action record, historical integrity",
        "sort_order": 40,
        "answer": (
            "No. Every performed Action creates a new Action Record. CheckStation does not "
            "store only current state."
        ),
    },
    {
        "slug": "can-staff-see-all-history",
        "question": "Can Staff see all History?",
        "category": FaqCategory.ATTENDANCE,
        "keywords": "staff history, assigned groups",
        "related_document_slug": "groups-members",
        "sort_order": 50,
        "answer": (
            "Staff can view and export History only for Groups they are assigned to. Owner "
            "and Admin can see workspace History according to their role."
        ),
    },
    # Email
    {
        "slug": "why-was-an-email-not-sent",
        "question": "Why was an email not sent?",
        "category": FaqCategory.EMAIL,
        "keywords": "email not sent, after-action, smtp, resend",
        "related_document_slug": "getting-started",
        "sort_order": 10,
        "answer": (
            "Check that after-action email is enabled on the Group, the participant has "
            "participation email(s), the sender is configured, and the address is valid. "
            "Platform signup/verification mail uses Resend. Group attendance mail uses "
            "the Group sender you configured (platform or custom SMTP). Ads or plan locks "
            "do not send mail."
        ),
    },
    {
        "slug": "can-i-use-gmail",
        "question": "Can I use Gmail to send Group emails?",
        "category": FaqCategory.EMAIL,
        "keywords": "gmail, app password, smtp",
        "sort_order": 20,
        "answer": (
            "Yes, as a Group custom sender using a **Gmail App Password** (not a normal "
            "account password). Gmail OAuth is not offered. You can also use Outlook / "
            "Microsoft 365 SMTP or Yahoo Mail App Password."
        ),
    },
    {
        "slug": "can-i-use-my-own-smtp",
        "question": "Can I use my own SMTP provider?",
        "category": FaqCategory.EMAIL,
        "keywords": "smtp, custom sender, company email",
        "sort_order": 30,
        "answer": (
            "Yes. Group email sender can be platform email or a custom company SMTP sender. "
            "Configure it on the Group. This is separate from CheckStation's own "
            "account/verification mail."
        ),
    },
    {
        "slug": "what-are-forward-emails",
        "question": "What are Forward Emails?",
        "category": FaqCategory.EMAIL,
        "keywords": "forward emails, private copies, plus, business",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 40,
        "answer": (
            "Forward Emails are extra private copies of Group after-action messages (up to "
            "three addresses). They are included on Plus and Business, not Basic. They are "
            "not the participant's own notification addresses."
        ),
    },
    {
        "slug": "how-many-participation-emails",
        "question": "How many emails can a participant have?",
        "category": FaqCategory.EMAIL,
        "keywords": "participation emails, three addresses",
        "related_document_slug": "groups-members",
        "sort_order": 50,
        "answer": (
            "Up to three participation addresses per Group/Class participation. When "
            "Require email is on, at least one is required. All configured addresses can "
            "receive after-action messages."
        ),
    },
    {
        "slug": "does-member-profile-email-sync-to-the-group",
        "question": "Does Member profile email sync to the Group?",
        "category": FaqCategory.EMAIL,
        "keywords": "profile email, prefill, sync",
        "related_document_slug": "groups-members",
        "sort_order": 60,
        "answer": (
            "Member profile email may prefill Group participation email when you add the "
            "Member. Editing the Member later does not change Group emails already stored."
        ),
    },
    {
        "slug": "is-platform-email-resend",
        "question": "What sends CheckStation account emails?",
        "category": FaqCategory.EMAIL,
        "keywords": "resend, verification email, platform email",
        "sort_order": 70,
        "answer": (
            "Account, verification, and platform billing-warning mail use CheckStation's "
            "platform email path (Resend). That is not the same as a Group's custom SMTP "
            "sender."
        ),
    },
    # Staff
    {
        "slug": "what-can-staff-see",
        "question": "What can Staff see?",
        "category": FaqCategory.STAFF,
        "keywords": "staff permissions, assigned groups",
        "related_document_slug": "groups-members",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "Staff is Group-scoped. In assigned Groups they can work with participants, "
            "launch/exit kiosk, and view/export History for those Groups. They cannot open "
            "unassigned Groups or the global Members directory."
        ),
    },
    {
        "slug": "can-staff-edit-groups",
        "question": "Can Staff edit Groups?",
        "category": FaqCategory.STAFF,
        "keywords": "staff configure, group settings, kiosk design",
        "related_document_slug": "groups-members",
        "sort_order": 20,
        "answer": (
            "No. Staff cannot configure Groups, kiosks, or email senders. Owner and Admin "
            "do that."
        ),
    },
    {
        "slug": "can-staff-manage-members",
        "question": "Can Staff manage Members?",
        "category": FaqCategory.STAFF,
        "keywords": "staff members directory",
        "related_document_slug": "groups-members",
        "sort_order": 30,
        "answer": (
            "Staff cannot use global Members directory/profile management. They can work "
            "with participants inside assigned Groups."
        ),
    },
    {
        "slug": "why-cant-a-staff-account-log-in",
        "question": "Why can't a Staff account log in?",
        "category": FaqCategory.STAFF,
        "keywords": "staff login failed, workspace id, username",
        "related_document_slug": "getting-started",
        "sort_order": 40,
        "answer": (
            "Use **Staff login**, not owner Login. You need Workspace ID, username, and "
            "password. The account must be active. Staff do not sign in with the owner's email."
        ),
    },
    {
        "slug": "what-can-admin-do",
        "question": "What can a workspace Admin do?",
        "category": FaqCategory.STAFF,
        "keywords": "admin permissions, workspace admin",
        "related_document_slug": "groups-members",
        "sort_order": 50,
        "answer": (
            "Admin can manage Members, Groups, kiosks, email settings, History, and Staff "
            "accounts. Admin cannot change billing, owner security, other Admin accounts, "
            "or delete the workspace. Plan limits still apply."
        ),
    },
    {
        "slug": "does-basic-include-staff",
        "question": "Does Basic include Staff or Admin seats?",
        "category": FaqCategory.STAFF,
        "keywords": "basic staff, zero admin",
        "related_document_slug": "billing-plans",
        "sort_order": 60,
        "answer": (
            "No. Basic allows {{PLAN_BASIC_LIMIT_WORKSPACE_ADMINS}} Admins and "
            "{{PLAN_BASIC_LIMIT_WORKSPACE_STAFF}} Staff. The Staff page is locked on Basic. "
            "Plus allows {{PLAN_PLUS_LIMIT_WORKSPACE_ADMINS}} Admins and "
            "{{PLAN_PLUS_LIMIT_WORKSPACE_STAFF}} Staff."
        ),
    },
    # Plans
    {
        "slug": "what-is-included-in-basic",
        "question": "What is included in Basic?",
        "category": FaqCategory.PLANS,
        "keywords": "basic plan, free, ads",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "Basic is free. It includes Standard Groups (up to "
            "{{PLAN_BASIC_LIMIT_ACTIVE_STANDARD_GROUPS}} active), "
            "{{PLAN_BASIC_LIMIT_MEMBERS}} Members, kiosk builder with all templates, and "
            "History. It does not include Structured Groups, Staff/Admin seats, file "
            "exports, or Forward Emails. Ads may appear in specified placements. Details: "
            "[Billing & Plans](/billing-plans)."
        ),
    },
    {
        "slug": "what-does-plus-include",
        "question": "What does Plus include?",
        "category": FaqCategory.PLANS,
        "keywords": "plus plan, exports, staff",
        "related_document_slug": "billing-plans",
        "sort_order": 20,
        "answer": (
            "Plus is paid ({{PLAN_PRICE_PLUS_MONTHLY}} monthly or {{PLAN_PRICE_PLUS_YEARLY}} "
            "yearly). No ads. Larger Standard limits, Admin/Staff seats, CSV/Excel/PDF "
            "export, and Forward Emails. Structured Groups are still Business-only."
        ),
    },
    {
        "slug": "what-does-business-include",
        "question": "What does Business include?",
        "category": FaqCategory.PLANS,
        "keywords": "business plan, structured groups, classes",
        "related_document_slug": "billing-plans",
        "sort_order": 30,
        "answer": (
            "Business is paid ({{PLAN_PRICE_BUSINESS_MONTHLY}} monthly or "
            "{{PLAN_PRICE_BUSINESS_YEARLY}} yearly). It includes Plus plus Structured "
            "Groups, Classes, larger limits, and Standard → Class snapshot import."
        ),
    },
    {
        "slug": "how-do-i-upgrade",
        "question": "How do I upgrade?",
        "category": FaqCategory.PLANS,
        "keywords": "upgrade, stripe, subscription",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 40,
        "answer": (
            "The owner opens **Account → Subscription** and chooses a paid plan. Web "
            "purchases use Stripe. Same-interval Plus → Business is immediate with Stripe "
            "proration."
        ),
    },
    {
        "slug": "current-plan-prices",
        "question": "What are the current prices?",
        "category": FaqCategory.PLANS,
        "keywords": "price, pricing, usd, 9.99, 14.99",
        "related_document_slug": "billing-plans",
        "sort_order": 50,
        "answer": (
            "Plus is {{PLAN_PRICE_PLUS_MONTHLY}} / month or {{PLAN_PRICE_PLUS_YEARLY}} / "
            "year. Business is {{PLAN_PRICE_BUSINESS_MONTHLY}} / month or "
            "{{PLAN_PRICE_BUSINESS_YEARLY}} / year. Basic is free. Yearly is 10 × monthly. "
            "Taxes and Stripe proration are calculated by Stripe."
        ),
    },
    {
        "slug": "are-kiosk-templates-on-basic",
        "question": "Does Basic include kiosk templates?",
        "category": FaqCategory.PLANS,
        "keywords": "basic templates, kiosk builder",
        "related_document_slug": "billing-plans",
        "sort_order": 60,
        "answer": (
            "Yes. All Card and Input kiosk templates are available on every plan, including "
            "Basic."
        ),
    },
    {
        "slug": "does-basic-have-ads",
        "question": "Does Basic show ads?",
        "category": FaqCategory.PLANS,
        "keywords": "ads, interstitial, banner",
        "related_document_slug": "billing-plans",
        "sort_order": 70,
        "answer": (
            "Yes, in Dashboard and Groups banners, and as interstitials before kiosk "
            "launch, after kiosk exit, and when leaving Kiosk Builder. Ads are not shown "
            "during live kiosk operation. Plus and Business have no ads."
        ),
    },
    {
        "slug": "where-are-invoices",
        "question": "Where can I find invoices?",
        "category": FaqCategory.PLANS,
        "keywords": "invoices, receipts, customer portal",
        "related_document_slug": "billing-plans",
        "sort_order": 80,
        "answer": (
            "The owner opens **Account → Billing**. For Stripe-managed subscriptions, "
            "invoices and receipts are in Stripe Customer Portal. CheckStation does not "
            "keep a second invoice store."
        ),
    },
    # Subscription changes
    {
        "slug": "when-does-a-downgrade-take-effect",
        "question": "When does a downgrade take effect?",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "downgrade, period end, business to plus",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "Business → Plus is scheduled for the **current paid period end**. You keep "
            "Business until then. Same-interval Plus → Business upgrades are immediate."
        ),
    },
    {
        "slug": "what-happens-when-i-cancel",
        "question": "What happens when I cancel?",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "cancel subscription, period end, basic",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 20,
        "answer": (
            "Cancellation is scheduled for paid period end or trial end. You keep access "
            "until then, then the workspace becomes Basic. Data is not deleted. You can "
            "**Resume** before the effective date."
        ),
    },
    {
        "slug": "can-i-change-monthly-to-yearly",
        "question": "Can I change monthly to yearly?",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "interval, yearly, monthly, schedule",
        "related_document_slug": "billing-plans",
        "sort_order": 30,
        "answer": (
            "Yes. Interval changes are always scheduled for period end. There is no "
            "immediate charge or proration for monthly ↔ yearly."
        ),
    },
    {
        "slug": "are-records-deleted-when-i-downgrade",
        "question": "Are my records deleted when I downgrade?",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "downgrade delete, data loss, plan-locked",
        "related_document_slug": "billing-plans",
        "sort_order": 40,
        "answer": (
            "No. Downgrade never automatically deletes Members, Groups, or Action Records. "
            "Extra items become plan-locked."
        ),
    },
    {
        "slug": "why-is-my-subscription-in-grace",
        "question": "Why is my subscription in a grace period?",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "grace period, payment failed, past due",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 50,
        "answer": (
            "A recurring payment failed. Paid access is kept for {{PAYMENT_GRACE_DAYS}} "
            "days. Update the payment method. If billing stays unresolved after grace, "
            "the workspace becomes Basic."
        ),
    },
    {
        "slug": "how-do-i-cancel-a-scheduled-change",
        "question": "How do I cancel a scheduled plan change?",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "keep business, resume, cancel schedule",
        "related_document_slug": "billing-plans",
        "sort_order": 60,
        "answer": (
            "Open **Account → Subscription** before the effective date. Resume a pending "
            "cancellation, keep Business to drop a scheduled Plus downgrade, or cancel a "
            "scheduled interval/combined change. Stripe-managed only."
        ),
    },
    {
        "slug": "combined-plan-and-interval-change",
        "question": "What if I change plan and monthly/yearly at the same time?",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "combined change, plus monthly business yearly",
        "related_document_slug": "billing-plans",
        "sort_order": 70,
        "answer": (
            "Combined plan + interval changes wait until period end. There is no immediate "
            "upgrade or proration for that combined change."
        ),
    },
    {
        "slug": "is-there-a-business-trial",
        "question": "Is there a Business trial?",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "trial, business trial, card required",
        "related_document_slug": "billing-plans",
        "sort_order": 80,
        "answer": (
            "When a trial is enabled, it is Business access, requires a payment method "
            "first, and is not started at registration. Current environment: trial is "
            "{{TRIAL_STATUS}}."
        ),
    },
    {
        "slug": "cancel-vs-delete-account",
        "question": "Is cancelling the same as deleting my account?",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "cancel vs delete, danger zone",
        "related_document_slug": "billing-plans",
        "sort_order": 90,
        "answer": (
            "No. Cancel stops paid renewal and returns the workspace to Basic at period "
            "end. Delete account permanently removes the workspace from Account → Security."
        ),
    },
    {
        "slug": "apple-billing",
        "question": "Can I manage billing through Apple?",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "apple, iap, app store, purchase source",
        "related_document_slug": "billing-plans",
        "sort_order": 100,
        "answer": (
            "Account can record an Apple purchase source and will hide Stripe portal "
            "actions for those subscriptions. Apple in-app purchase checkout is not "
            "implemented in the current product."
        ),
    },
    # Troubleshooting
    {
        "slug": "kiosk-locked-and-cannot-open-workspace",
        "question": "The browser says the kiosk is locked. How do I get back?",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "kiosk_locked, exit code, unlock",
        "related_document_slug": "kiosk-setup",
        "sort_order": 10,
        "answer": (
            "Enter the Group kiosk **exit code** (4–10 letters or numbers). It is not the "
            "owner password. If you do not have it, another Owner/Admin who can open the "
            "Group can read or reset the exit code from Group kiosk settings."
        ),
    },
    {
        "slug": "plan-locked-member-cannot-open",
        "question": "Why can't I open a Member after I changed plan?",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "plan-locked member, downgrade members",
        "related_document_slug": "groups-members",
        "sort_order": 20,
        "answer": (
            "That Member is over the new plan's Member limit. It stays in the list but "
            "cannot be opened until you archive other Members or upgrade."
        ),
    },
    {
        "slug": "cannot-create-structured-group",
        "question": "Why can't I create a Structured Group?",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "structured locked, plus, business only",
        "related_document_slug": "billing-plans",
        "sort_order": 30,
        "answer": (
            "Structured Groups require **Business**. Plus and Basic cannot create them. "
            "Role permission (Admin) does not override the plan."
        ),
    },
    {
        "slug": "staff-page-locked",
        "question": "Why is the Staff page locked?",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "staff locked, basic",
        "related_document_slug": "billing-plans",
        "sort_order": 40,
        "answer": (
            "Basic has no Admin or Staff seats. Upgrade to Plus or Business to use Staff."
        ),
    },
    {
        "slug": "export-buttons-missing",
        "question": "Why can't I export a report?",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "export locked, csv, basic",
        "related_document_slug": "billing-plans",
        "sort_order": 50,
        "answer": (
            "File export is Plus and Business. Basic can view reports in the workspace "
            "only. Staff also need to be assigned to that Group."
        ),
    },
    {
        "slug": "scheduled-downgrade-still-on-business",
        "question": "I scheduled a downgrade. Why do I still have Business?",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "scheduled change, still business, period end",
        "related_document_slug": "billing-plans",
        "sort_order": 60,
        "answer": (
            "That is expected. You keep the current plan until period end. Plan locks do "
            "not apply early. Cancel the scheduled change if you want to stay on Business."
        ),
    },
    # Privacy
    {
        "slug": "who-controls-member-data",
        "question": "Who controls Member data?",
        "category": FaqCategory.PRIVACY,
        "keywords": "tenant, organization, member data, privacy",
        "related_document_slug": "privacy-policy",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "Each Organization workspace controls its own Member and Group data. "
            "Organization A cannot access Organization B. See the "
            "[Privacy Policy](/privacy-policy)."
        ),
    },
    {
        "slug": "where-is-the-privacy-policy",
        "question": "Where can I read the Privacy Policy?",
        "category": FaqCategory.PRIVACY,
        "keywords": "privacy policy, legal",
        "related_document_slug": "privacy-policy",
        "sort_order": 20,
        "answer": (
            "Read it on Docs: [Privacy Policy](/privacy-policy). The website footer opens "
            "the same canonical document in a new tab."
        ),
    },
    {
        "slug": "where-are-the-terms",
        "question": "Where can I read the Terms of Use?",
        "category": FaqCategory.PRIVACY,
        "keywords": "terms, legal, agreement",
        "related_document_slug": "terms-of-use",
        "sort_order": 30,
        "answer": "Read [Terms of Use](/terms-of-use)."
    },
    {
        "slug": "does-downgrade-delete-personal-data",
        "question": "Does changing plan delete personal data?",
        "category": FaqCategory.PRIVACY,
        "keywords": "gdpr, deletion, downgrade privacy",
        "related_document_slug": "privacy-policy",
        "sort_order": 40,
        "answer": (
            "No. Plan changes do not auto-delete Member or attendance data. Account "
            "deletion is a separate owner action in Account → Security."
        ),
    },
    {
        "slug": "are-pins-passwords",
        "question": "Are Group PINs passwords?",
        "category": FaqCategory.PRIVACY,
        "keywords": "pin security, attendance code",
        "related_document_slug": "groups-members",
        "sort_order": 50,
        "answer": (
            "No. Group PINs are low-security attendance check-in codes so managers can "
            "see assigned values. They are not workspace logins. Kiosk list payloads hide "
            "PINs from participants."
        ),
    },
    # General
    {
        "slug": "is-there-an-ios-or-android-app",
        "question": "Is there an iOS or Android app?",
        "category": FaqCategory.GENERAL,
        "keywords": "mobile, ios, android, app store, desktop",
        "sort_order": 10,
        "answer": (
            "Not yet. CheckStation is a web product today. You can run a Group kiosk in a "
            "mobile or tablet browser. Native iOS, Android, and desktop apps are planned "
            "later and are not available now."
        ),
    },
    {
        "slug": "is-checkstation-only-for-schools",
        "question": "Is CheckStation only for schools?",
        "category": FaqCategory.GENERAL,
        "keywords": "industry, schools, gyms, generic",
        "sort_order": 20,
        "answer": (
            "No. CheckStation is a multi-tenant, industry-agnostic check-in platform. "
            "Schools, clubs, companies, and other organizations can use Groups in their "
            "own way."
        ),
    },
    {
        "slug": "how-do-i-search-this-faq",
        "question": "How do I search this FAQ?",
        "category": FaqCategory.GENERAL,
        "keywords": "search, help, categories",
        "related_document_slug": "faq",
        "sort_order": 30,
        "answer": (
            "Type in the search box on this page. Matching is instant and looks at "
            "questions, answers, categories, and keywords. You can share a search with "
            "`/faq?q=` in the address. Future apps can use the same FAQ API instead of "
            "this webpage."
        ),
    },
    {
        "slug": "where-is-status",
        "question": "Where is system status?",
        "category": FaqCategory.GENERAL,
        "keywords": "status page, outage, health",
        "sort_order": 40,
        "answer": (
            "Use the **Status** link in the website footer. It opens the CheckStation "
            "Status site in a new tab. Status is a separate service from Docs."
        ),
    },
)
