"""Canonical public Contact categories and subcategory FAQ mappings.

This module is the allowlist for POST /api/contact/. Future Workspace and
native clients should fetch GET /api/contact/categories/ rather than copy
these labels. FAQ answers live in content.FaqEntry — never duplicate them.
"""

from content.models import FaqCategory

CLIENT_TYPES = (
    "public_web",
    "workspace_web",
    "ios",
    "android",
    "desktop",
)

NAME_MAX = 80
EMAIL_MAX = 254
SUBJECT_MIN = 8
SUBJECT_MAX = 120
MESSAGE_MIN = 20
MESSAGE_MAX = 4000
HONEYPOT_FIELD = "company_url"
SUGGESTION_LIMIT = 5

CONTACT_CATEGORIES = (
    {
        "id": "account_login",
        "label": "Account & Login",
        "subcategories": (
            {
                "id": "cannot_log_in",
                "label": "Cannot log in",
                "faq_categories": (FaqCategory.ACCOUNT_SECURITY, FaqCategory.GETTING_STARTED),
                "faq_queries": ("cannot log in", "staff login", "email verification"),
            },
            {
                "id": "password_reset",
                "label": "Password reset",
                "faq_categories": (FaqCategory.ACCOUNT_SECURITY,),
                "faq_queries": ("change password", "password reset"),
            },
            {
                "id": "email_verification",
                "label": "Email verification",
                "faq_categories": (FaqCategory.ACCOUNT_SECURITY, FaqCategory.GETTING_STARTED),
                "faq_queries": ("email verification", "cannot use the workspace"),
            },
            {
                "id": "two_factor",
                "label": "Two-factor authentication",
                "faq_categories": (FaqCategory.ACCOUNT_SECURITY,),
                "faq_queries": ("two-factor", "2fa"),
            },
            {
                "id": "staff_login",
                "label": "Staff login",
                "faq_categories": (FaqCategory.STAFF, FaqCategory.ACCOUNT_SECURITY),
                "faq_queries": ("staff login", "workspace ID", "staff account log in"),
            },
            {
                "id": "account_deletion",
                "label": "Account deletion",
                "faq_categories": (FaqCategory.ACCOUNT_SECURITY, FaqCategory.PRIVACY),
                "faq_queries": ("delete my account", "cancel vs delete"),
                "privacy_request": True,
            },
            {
                "id": "other_account",
                "label": "Other account issue",
                "faq_categories": (FaqCategory.ACCOUNT_SECURITY,),
                "faq_queries": ("account", "login"),
            },
        ),
    },
    {
        "id": "members_groups",
        "label": "Members & Groups",
        "subcategories": (
            {
                "id": "create_edit_member",
                "label": "Create or edit a Member",
                "faq_categories": (FaqCategory.MEMBERS_GROUPS,),
                "faq_queries": ("what is a member", "create member", "member number"),
            },
            {
                "id": "add_remove_participant",
                "label": "Add/remove participant",
                "faq_categories": (FaqCategory.MEMBERS_GROUPS,),
                "faq_queries": (
                    "add existing member",
                    "removing a member from a group",
                    "visitor",
                ),
            },
            {
                "id": "group_setup",
                "label": "Group setup",
                "faq_categories": (FaqCategory.MEMBERS_GROUPS, FaqCategory.GETTING_STARTED),
                "faq_queries": ("first group", "group setup", "standard vs structured"),
            },
            {
                "id": "standard_group",
                "label": "Standard Group",
                "faq_categories": (FaqCategory.MEMBERS_GROUPS,),
                "faq_queries": ("standard group", "standard vs structured"),
            },
            {
                "id": "structured_group",
                "label": "Structured Group / Classes",
                "faq_categories": (FaqCategory.MEMBERS_GROUPS, FaqCategory.TROUBLESHOOTING),
                "faq_queries": (
                    "structured group",
                    "classes",
                    "cannot create structured",
                ),
            },
            {
                "id": "archive_delete",
                "label": "Archive or delete",
                "faq_categories": (FaqCategory.MEMBERS_GROUPS,),
                "faq_queries": ("archive a member", "permanently delete a member"),
            },
            {
                "id": "plan_locked",
                "label": "Plan-locked Member/Group",
                "faq_categories": (FaqCategory.MEMBERS_GROUPS, FaqCategory.TROUBLESHOOTING),
                "faq_queries": (
                    "group plan locked",
                    "plan-locked member",
                    "downgrade",
                ),
            },
            {
                "id": "other_members_groups",
                "label": "Other Members/Groups issue",
                "faq_categories": (FaqCategory.MEMBERS_GROUPS,),
                "faq_queries": ("member", "group"),
            },
        ),
    },
    {
        "id": "kiosk",
        "label": "Kiosk",
        "subcategories": (
            {
                "id": "cannot_launch",
                "label": "Cannot launch kiosk",
                "faq_categories": (FaqCategory.KIOSK, FaqCategory.TROUBLESHOOTING),
                "faq_queries": (
                    "why can't I launch my kiosk",
                    "kiosk readiness",
                    "plan locked",
                    "PIN required",
                ),
            },
            {
                "id": "readiness",
                "label": "Kiosk readiness issue",
                "faq_categories": (FaqCategory.KIOSK,),
                "faq_queries": ("kiosk readiness", "why can't I launch", "PIN"),
            },
            {
                "id": "pin_problem",
                "label": "PIN problem",
                "faq_categories": (FaqCategory.KIOSK, FaqCategory.MEMBERS_GROUPS),
                "faq_queries": ("kiosk PIN", "where do PINs live", "PIN required"),
            },
            {
                "id": "identification",
                "label": "Identification problem",
                "faq_categories": (FaqCategory.KIOSK,),
                "faq_queries": ("participant code", "identify", "kiosk PIN"),
            },
            {
                "id": "check_in_out",
                "label": "Check-in/out problem",
                "faq_categories": (FaqCategory.KIOSK, FaqCategory.ATTENDANCE),
                "faq_queries": ("check-in", "test check-in", "overwrite history"),
            },
            {
                "id": "break_action",
                "label": "Break action problem",
                "faq_categories": (FaqCategory.KIOSK, FaqCategory.ATTENDANCE),
                "faq_queries": ("break", "check-in"),
            },
            {
                "id": "kiosk_design",
                "label": "Kiosk design",
                "faq_categories": (FaqCategory.KIOSK,),
                "faq_queries": ("kiosk design", "templates", "header footer", "builder"),
            },
            {
                "id": "kiosk_lock",
                "label": "Kiosk lock",
                "faq_categories": (FaqCategory.KIOSK, FaqCategory.TROUBLESHOOTING),
                "faq_queries": ("kiosk lock", "kiosk locked", "cannot open workspace"),
            },
            {
                "id": "exit_kiosk",
                "label": "Exit kiosk",
                "faq_categories": (FaqCategory.KIOSK,),
                "faq_queries": ("exit kiosk", "kiosk lock", "exit code"),
            },
            {
                "id": "other_kiosk",
                "label": "Other kiosk issue",
                "faq_categories": (FaqCategory.KIOSK,),
                "faq_queries": ("kiosk",),
            },
        ),
    },
    {
        "id": "attendance",
        "label": "Attendance & History",
        "subcategories": (
            {
                "id": "missing_record",
                "label": "Missing attendance record",
                "faq_categories": (FaqCategory.ATTENDANCE,),
                "faq_queries": ("history", "archive someone", "action record"),
            },
            {
                "id": "incorrect_check",
                "label": "Incorrect check-in/out",
                "faq_categories": (FaqCategory.ATTENDANCE,),
                "faq_queries": ("overwrite history", "check-in"),
            },
            {
                "id": "attendance_report",
                "label": "Attendance report",
                "faq_categories": (FaqCategory.ATTENDANCE,),
                "faq_queries": ("attendance report", "export attendance"),
            },
            {
                "id": "history",
                "label": "History",
                "faq_categories": (FaqCategory.ATTENDANCE,),
                "faq_queries": ("attendance history", "staff see all history"),
            },
            {
                "id": "export",
                "label": "Export",
                "faq_categories": (FaqCategory.ATTENDANCE, FaqCategory.TROUBLESHOOTING),
                "faq_queries": ("export attendance", "export buttons missing"),
            },
            {
                "id": "other_attendance",
                "label": "Other attendance issue",
                "faq_categories": (FaqCategory.ATTENDANCE,),
                "faq_queries": ("history", "attendance"),
            },
        ),
    },
    {
        "id": "email",
        "label": "Email & Notifications",
        "subcategories": (
            {
                "id": "email_not_sent",
                "label": "Email not sent",
                "faq_categories": (FaqCategory.EMAIL,),
                "faq_queries": ("email not sent", "why was an email", "SMTP"),
            },
            {
                "id": "smtp_setup",
                "label": "SMTP setup",
                "faq_categories": (FaqCategory.EMAIL,),
                "faq_queries": ("own SMTP", "email not sent"),
            },
            {
                "id": "gmail",
                "label": "Gmail",
                "faq_categories": (FaqCategory.EMAIL,),
                "faq_queries": ("gmail", "email not sent"),
            },
            {
                "id": "microsoft",
                "label": "Microsoft / Outlook",
                "faq_categories": (FaqCategory.EMAIL,),
                "faq_queries": ("outlook", "microsoft", "SMTP"),
            },
            {
                "id": "yahoo",
                "label": "Yahoo",
                "faq_categories": (FaqCategory.EMAIL,),
                "faq_queries": ("yahoo", "SMTP", "email not sent"),
            },
            {
                "id": "participation_email",
                "label": "Participation email",
                "faq_categories": (FaqCategory.EMAIL, FaqCategory.MEMBERS_GROUPS),
                "faq_queries": (
                    "participation emails",
                    "member profile email sync",
                    "member emails required",
                ),
            },
            {
                "id": "forward_emails",
                "label": "Forward Emails",
                "faq_categories": (FaqCategory.EMAIL,),
                "faq_queries": ("forward emails",),
            },
            {
                "id": "other_email",
                "label": "Other email issue",
                "faq_categories": (FaqCategory.EMAIL,),
                "faq_queries": ("email", "notification"),
            },
        ),
    },
    {
        "id": "staff",
        "label": "Staff & Permissions",
        "subcategories": (
            {
                "id": "add_admin_staff",
                "label": "Add Admin/Staff",
                "faq_categories": (FaqCategory.STAFF, FaqCategory.PLANS),
                "faq_queries": ("does basic include staff", "what can admin do"),
            },
            {
                "id": "staff_login_issue",
                "label": "Staff login",
                "faq_categories": (FaqCategory.STAFF,),
                "faq_queries": ("staff account log in", "staff login"),
            },
            {
                "id": "permission_issue",
                "label": "Permission issue",
                "faq_categories": (FaqCategory.STAFF,),
                "faq_queries": ("what can staff see", "staff edit groups", "admin do"),
            },
            {
                "id": "staff_cannot_see_group",
                "label": "Staff cannot see Group",
                "faq_categories": (FaqCategory.STAFF,),
                "faq_queries": ("what can staff see", "staff history"),
            },
            {
                "id": "staff_plan_limit",
                "label": "Staff plan limit",
                "faq_categories": (FaqCategory.STAFF, FaqCategory.TROUBLESHOOTING),
                "faq_queries": ("staff page locked", "basic include staff"),
            },
            {
                "id": "other_staff",
                "label": "Other staff issue",
                "faq_categories": (FaqCategory.STAFF,),
                "faq_queries": ("staff", "admin"),
            },
        ),
    },
    {
        "id": "plans_billing",
        "label": "Plans & Billing",
        "subcategories": (
            {
                "id": "upgrade",
                "label": "Upgrade",
                "faq_categories": (FaqCategory.PLANS, FaqCategory.SUBSCRIPTION_CHANGES),
                "faq_queries": ("how do I upgrade", "what does plus include"),
            },
            {
                "id": "downgrade",
                "label": "Downgrade",
                "faq_categories": (FaqCategory.SUBSCRIPTION_CHANGES, FaqCategory.MEMBERS_GROUPS),
                "faq_queries": (
                    "when does a downgrade take effect",
                    "plan-locked",
                    "records deleted when I downgrade",
                    "data if I downgrade",
                ),
            },
            {
                "id": "billing_interval",
                "label": "Monthly/yearly billing",
                "faq_categories": (FaqCategory.SUBSCRIPTION_CHANGES,),
                "faq_queries": ("monthly to yearly", "interval"),
            },
            {
                "id": "change_interval",
                "label": "Change billing interval",
                "faq_categories": (FaqCategory.SUBSCRIPTION_CHANGES,),
                "faq_queries": ("monthly to yearly", "combined plan and interval"),
            },
            {
                "id": "cancel_subscription",
                "label": "Cancel subscription",
                "faq_categories": (FaqCategory.SUBSCRIPTION_CHANGES,),
                "faq_queries": ("what happens when I cancel", "cancel vs delete"),
            },
            {
                "id": "resume_cancellation",
                "label": "Resume cancellation",
                "faq_categories": (FaqCategory.SUBSCRIPTION_CHANGES,),
                "faq_queries": ("cancel a scheduled change", "cancel subscription"),
            },
            {
                "id": "payment_failed",
                "label": "Payment failed",
                "faq_categories": (FaqCategory.SUBSCRIPTION_CHANGES,),
                "faq_queries": ("grace", "payment"),
            },
            {
                "id": "grace_period",
                "label": "Grace period",
                "faq_categories": (FaqCategory.SUBSCRIPTION_CHANGES,),
                "faq_queries": ("grace period", "subscription in grace"),
            },
            {
                "id": "invoice",
                "label": "Invoice / receipt",
                "faq_categories": (FaqCategory.PLANS,),
                "faq_queries": ("invoices", "receipt", "stripe"),
            },
            {
                "id": "trial",
                "label": "Trial",
                "faq_categories": (FaqCategory.SUBSCRIPTION_CHANGES, FaqCategory.PLANS),
                "faq_queries": ("business trial",),
            },
            {
                "id": "stripe_billing",
                "label": "Stripe billing",
                "faq_categories": (FaqCategory.PLANS, FaqCategory.SUBSCRIPTION_CHANGES),
                "faq_queries": ("stripe", "invoices", "upgrade"),
            },
            {
                "id": "other_billing",
                "label": "Other billing issue",
                "faq_categories": (FaqCategory.PLANS, FaqCategory.SUBSCRIPTION_CHANGES),
                "faq_queries": ("plan", "billing", "subscription"),
            },
        ),
    },
    {
        "id": "privacy_data",
        "label": "Privacy & Data",
        "privacy_request": True,
        "subcategories": (
            {
                "id": "privacy_question",
                "label": "Privacy question",
                "faq_categories": (FaqCategory.PRIVACY,),
                "faq_queries": ("privacy policy", "who controls member data"),
                "privacy_request": True,
            },
            {
                "id": "access_data",
                "label": "Access my data",
                "faq_categories": (FaqCategory.PRIVACY,),
                "faq_queries": ("who controls member data", "privacy"),
                "privacy_request": True,
            },
            {
                "id": "correct_data",
                "label": "Correct my data",
                "faq_categories": (FaqCategory.PRIVACY,),
                "faq_queries": ("member data", "privacy"),
                "privacy_request": True,
            },
            {
                "id": "delete_data",
                "label": "Delete data",
                "faq_categories": (FaqCategory.PRIVACY, FaqCategory.ACCOUNT_SECURITY),
                "faq_queries": (
                    "delete my account",
                    "downgrade delete personal data",
                    "permanently delete",
                ),
                "privacy_request": True,
            },
            {
                "id": "privacy_account_deletion",
                "label": "Account deletion",
                "faq_categories": (FaqCategory.ACCOUNT_SECURITY, FaqCategory.PRIVACY),
                "faq_queries": ("delete my account", "cancel vs delete"),
                "privacy_request": True,
            },
            {
                "id": "legal_privacy_request",
                "label": "Legal/privacy request",
                "faq_categories": (FaqCategory.PRIVACY,),
                "faq_queries": ("privacy policy", "terms"),
                "privacy_request": True,
            },
            {
                "id": "other_privacy",
                "label": "Other privacy issue",
                "faq_categories": (FaqCategory.PRIVACY,),
                "faq_queries": ("privacy", "data"),
                "privacy_request": True,
            },
        ),
    },
    {
        "id": "technical",
        "label": "Technical Problem",
        "subcategories": (
            {
                "id": "page_not_loading",
                "label": "Page not loading",
                "faq_categories": (FaqCategory.TROUBLESHOOTING, FaqCategory.GENERAL),
                "faq_queries": ("status", "kiosk locked"),
            },
            {
                "id": "slow_performance",
                "label": "Slow performance",
                "faq_categories": (FaqCategory.TROUBLESHOOTING,),
                "faq_queries": ("status",),
            },
            {
                "id": "display_issue",
                "label": "App/display issue",
                "faq_categories": (FaqCategory.TROUBLESHOOTING, FaqCategory.KIOSK),
                "faq_queries": ("tablet", "kiosk design"),
            },
            {
                "id": "api_service",
                "label": "API/service issue",
                "faq_categories": (FaqCategory.TROUBLESHOOTING, FaqCategory.GENERAL),
                "faq_queries": ("status",),
            },
            {
                "id": "status_outage",
                "label": "Status/outage",
                "faq_categories": (FaqCategory.GENERAL,),
                "faq_queries": ("where is status", "status"),
            },
            {
                "id": "other_technical",
                "label": "Other technical problem",
                "faq_categories": (FaqCategory.TROUBLESHOOTING,),
                "faq_queries": ("troubleshooting", "status"),
            },
        ),
    },
    {
        "id": "feedback_business",
        "label": "Feedback & Business",
        "subcategories": (
            {
                "id": "feature_request",
                "label": "Feature request",
                "faq_categories": (FaqCategory.GENERAL,),
                "faq_queries": ("ios or android", "events area"),
            },
            {
                "id": "bug_report",
                "label": "Bug report",
                "faq_categories": (FaqCategory.TROUBLESHOOTING,),
                "faq_queries": ("troubleshooting",),
            },
            {
                "id": "product_feedback",
                "label": "Product feedback",
                "faq_categories": (FaqCategory.GENERAL,),
                "faq_queries": ("only for schools",),
            },
            {
                "id": "partnership",
                "label": "Partnership",
                "faq_categories": (FaqCategory.GENERAL,),
                "faq_queries": ("checkstation",),
            },
            {
                "id": "business_inquiry",
                "label": "Business inquiry",
                "faq_categories": (FaqCategory.GENERAL, FaqCategory.PLANS),
                "faq_queries": ("plans",),
            },
            {
                "id": "other_feedback",
                "label": "Other",
                "faq_categories": (FaqCategory.GENERAL,),
                "faq_queries": ("faq",),
            },
        ),
    },
    {
        "id": "other",
        "label": "Other",
        "subcategories": (
            {
                "id": "general_question",
                "label": "General question",
                "faq_categories": (FaqCategory.GENERAL,),
                "faq_queries": ("search this faq", "only for schools", "status"),
            },
            {
                "id": "something_else",
                "label": "Something else",
                "faq_categories": (FaqCategory.GENERAL,),
                "faq_queries": ("faq", "status"),
            },
        ),
    },
)


def _index():
    categories = {}
    pairs = {}
    for category in CONTACT_CATEGORIES:
        categories[category["id"]] = category
        for sub in category["subcategories"]:
            pairs[(category["id"], sub["id"])] = (category, sub)
    return categories, pairs


_CATEGORY_BY_ID, _PAIR_INDEX = _index()


def get_category(category_id):
    return _CATEGORY_BY_ID.get(str(category_id or "").strip())


def get_pair(category_id, subcategory_id):
    return _PAIR_INDEX.get(
        (str(category_id or "").strip(), str(subcategory_id or "").strip())
    )


def is_privacy_request(category_id, subcategory_id):
    pair = get_pair(category_id, subcategory_id)
    if not pair:
        return False
    category, sub = pair
    return bool(sub.get("privacy_request") or category.get("privacy_request"))


def public_categories_payload():
    categories = []
    for category in CONTACT_CATEGORIES:
        categories.append(
            {
                "id": category["id"],
                "label": category["label"],
                "subcategories": [
                    {
                        "id": sub["id"],
                        "label": sub["label"],
                        "faq_queries": list(sub.get("faq_queries") or ()),
                        "faq_categories": list(sub.get("faq_categories") or ()),
                    }
                    for sub in category["subcategories"]
                ],
            }
        )
    return categories
