# Billing & Plans

This is the customer reference for CheckStation subscriptions. Numbers below are filled from the same plan catalog the product uses. If a commercial detail is still configurable or not offered in this environment, this page says so instead of inventing a rule.

Paid checkout on the web uses **Stripe**. Apple App Store purchases are recognized as a purchase source in Account, but Apple in-app purchase execution is not offered yet.

## 1. Available plans

CheckStation has three plans:

- **{{PLAN_BASIC_NAME}}** — free
- **{{PLAN_PLUS_NAME}}** — paid
- **{{PLAN_BUSINESS_NAME}}** — paid

There is no separate Free, Pro, or Enterprise plan.

New workspaces start on Basic after registration. A Business trial is not started automatically at signup.

## 2. Basic

{{PLAN_BASIC_NAME}} is free and stays available after a paid subscription ends.

It includes Standard Groups, kiosk builder (all Card and Input templates), History, and Group email senders. It does **not** include Structured Groups, Staff/Admin seats, report exports, or Forward Emails.

Basic **shows ads** in specified workspace placements. See [Ads on Basic](#16-ads-on-basic).

## 3. Plus

{{PLAN_PLUS_NAME}} is the first paid plan. No ads. Larger Standard Group and Member limits. Admin and Staff seats. CSV, Excel, and PDF exports. Forward Emails.

Plus does **not** include Structured Groups.

## 4. Business

{{PLAN_BUSINESS_NAME}} includes Plus capabilities plus Structured Groups, Classes, larger limits, and Standard → Structured Class snapshot import.

## 5. Monthly billing

Paid plans can be billed **monthly**. The billing interval is chosen at checkout and can later be changed on a Stripe-managed subscription. Interval changes take effect at period end. See [Monthly → yearly](#22-monthly--yearly).

## 6. Yearly billing

Paid plans can be billed **yearly**. Yearly list price is **10 × monthly** (two months effectively included in the annual price).

## 7. Current pricing

Prices are USD list prices from the billing catalog:

| Plan | Monthly | Yearly |
| --- | --- | --- |
| {{PLAN_BASIC_NAME}} | Free | Free |
| {{PLAN_PLUS_NAME}} | {{PLAN_PRICE_PLUS_MONTHLY}} | {{PLAN_PRICE_PLUS_YEARLY}} |
| {{PLAN_BUSINESS_NAME}} | {{PLAN_PRICE_BUSINESS_MONTHLY}} | {{PLAN_PRICE_BUSINESS_YEARLY}} |

Taxes, payment-method fees, and Stripe proration amounts are calculated by Stripe. CheckStation does not invent those amounts in this article.

## 8. What's included in each plan

| Capability | Basic | Plus | Business |
| --- | --- | --- | --- |
| Standard Groups | Yes | Yes | Yes |
| Structured Groups / Classes | No | No | Yes |
| Kiosk templates | All | All | All |
| Admin / Staff | No | Yes | Yes |
| CSV / Excel / PDF export | No | Yes | Yes |
| Forward Emails | No | Yes | Yes |
| Snapshot import into a Class | No | No | Yes |
| Ads | Yes | No | No |

Group after-action email (platform or custom SMTP) is available on every plan. Forward Emails are Plus and Business.

## 9. Group limits

Active and archived Group limits are separate. Archived Groups do not consume the active limit.

| Limit | Basic | Plus | Business |
| --- | --- | --- | --- |
| Active Standard Groups | {{PLAN_BASIC_LIMIT_ACTIVE_STANDARD_GROUPS}} | {{PLAN_PLUS_LIMIT_ACTIVE_STANDARD_GROUPS}} | {{PLAN_BUSINESS_LIMIT_ACTIVE_STANDARD_GROUPS}} |
| Active Structured Groups | {{PLAN_BASIC_LIMIT_ACTIVE_STRUCTURED_GROUPS}} | {{PLAN_PLUS_LIMIT_ACTIVE_STRUCTURED_GROUPS}} | {{PLAN_BUSINESS_LIMIT_ACTIVE_STRUCTURED_GROUPS}} |
| Archived Groups | {{PLAN_BASIC_LIMIT_ARCHIVED_GROUPS}} | {{PLAN_PLUS_LIMIT_ARCHIVED_GROUPS}} | {{PLAN_BUSINESS_LIMIT_ARCHIVED_GROUPS}} |

## 10. Member limits

| Limit | Basic | Plus | Business |
| --- | --- | --- | --- |
| Members | {{PLAN_BASIC_LIMIT_MEMBERS}} | {{PLAN_PLUS_LIMIT_MEMBERS}} | {{PLAN_BUSINESS_LIMIT_MEMBERS}} |

## 11. Participant and Class limits

| Limit | Basic | Plus | Business |
| --- | --- | --- | --- |
| Participants per Standard Group | {{PLAN_BASIC_LIMIT_PARTICIPANTS_PER_STANDARD_GROUP}} | {{PLAN_PLUS_LIMIT_PARTICIPANTS_PER_STANDARD_GROUP}} | {{PLAN_BUSINESS_LIMIT_PARTICIPANTS_PER_STANDARD_GROUP}} |
| Classes per Structured Group | {{PLAN_BASIC_LIMIT_CLASSES_PER_STRUCTURED_GROUP}} | {{PLAN_PLUS_LIMIT_CLASSES_PER_STRUCTURED_GROUP}} | {{PLAN_BUSINESS_LIMIT_CLASSES_PER_STRUCTURED_GROUP}} |
| Participants per Class | {{PLAN_BASIC_LIMIT_PARTICIPANTS_PER_CLASS}} | {{PLAN_PLUS_LIMIT_PARTICIPANTS_PER_CLASS}} | {{PLAN_BUSINESS_LIMIT_PARTICIPANTS_PER_CLASS}} |

## 12. Admin and Staff limits

| Limit | Basic | Plus | Business |
| --- | --- | --- | --- |
| Workspace Admins | {{PLAN_BASIC_LIMIT_WORKSPACE_ADMINS}} | {{PLAN_PLUS_LIMIT_WORKSPACE_ADMINS}} | {{PLAN_BUSINESS_LIMIT_WORKSPACE_ADMINS}} |
| Workspace Staff | {{PLAN_BASIC_LIMIT_WORKSPACE_STAFF}} | {{PLAN_PLUS_LIMIT_WORKSPACE_STAFF}} | {{PLAN_BUSINESS_LIMIT_WORKSPACE_STAFF}} |

On Basic the Staff page is locked because those seats are 0.

## 13. Structured Groups

Only Business can create and operate Structured Groups. If you downgrade from Business, existing Structured Groups become plan-locked. They are not deleted. See [Groups & Members](/groups-members).

## 14. Exports

Plus and Business can export Attendance Reports as **CSV**, **Excel (.xlsx)**, and **PDF**. Basic can view reports in the workspace but cannot export those files.

Staff export is limited to assigned Groups and still requires a plan that includes export.

## 15. Forward Emails

Forward Emails are extra private copies of Group after-action messages (up to three addresses). Plus and Business include them. Basic does not.

This is separate from participation emails (the addresses for the person who checked in) and from the Group's own SMTP sender.

## 16. Ads on Basic

On Basic, ads may appear as:

- Dashboard banner
- Groups banner
- before kiosk launch (interstitial)
- after kiosk exit (interstitial)
- when leaving Kiosk Builder (interstitial)

Ads are **not** shown during live participant kiosk operation, and not on Members, History, Staff, or Account.

Plus and Business have no ads. A platform-operator kill switch can hide ads without changing your plan. Local development uses a mock ad provider. A failed ad must never block Dashboard, Groups, or kiosk launch.

## 17. Upgrading

The workspace **owner** upgrades from **Account → Subscription**.

Paid web upgrades use Stripe Checkout or an in-account plan change, depending on whether you already have a Stripe subscription.

Same-interval Plus → Business is **immediate**. Other changes may be scheduled. See the sections below.

Staff and Admin cannot change the plan.

## 18. Plus → Business same-interval upgrade

If you are already on Plus monthly and choose Business monthly (or Plus yearly → Business yearly), the upgrade is **immediate**.

Stripe calculates unused Plus time as credit and charges the remaining prorated Business difference. CheckStation does not invent that amount. Account shows a Stripe-calculated preview before you confirm when that preview is available.

The billing-cycle renewal date is preserved where Stripe supports it. You are not charged a full new Business year on top of time already paid on Plus.

## 19. Proration

Proration applies to **same-interval paid upgrades**. Stripe calculates the amount.

There is **no** immediate proration charge for:

- monthly ↔ yearly interval changes
- combined plan + interval changes (those wait until period end)

Do not expect CheckStation to show a homemade proration formula.

## 20. Downgrading

**Business → Plus** on the same interval is **scheduled** for the current paid period end.

Until then:

- you keep Business access
- Groups and Members are not plan-locked early
- you can cancel the scheduled downgrade

At period end, the workspace becomes Plus and plan-lock rules run if usage is over Plus limits.

Downgrading from a paid plan to Basic is **cancellation**, not a Plus downgrade. See [Cancelling subscription](#26-cancelling-subscription).

## 21. Scheduled plan changes

Scheduled changes wait until the current paid period ends. They include:

- Business → Plus
- monthly ↔ yearly
- combined plan + interval (for example Plus monthly → Business yearly)
- cancellation (access until period or trial end)

You can cancel a scheduled change before it takes effect. See [Cancelling a scheduled change](#25-cancelling-a-scheduled-change).

## 22. Monthly → yearly

Changing monthly to yearly is always **scheduled for period end**. There is no immediate charge and no proration for an interval-only change.

## 23. Yearly → monthly

Changing yearly to monthly is also **scheduled for period end**. Remaining yearly time is not converted into an immediate monthly invoice.

## 24. Combined plan + interval changes

A change that switches **both** plan and interval (Plus monthly → Business yearly, Business yearly → Plus monthly, and similar) is scheduled **entirely** for period end.

There is no immediate tier upgrade and no proration preview for that combined change. The target plan applies at the effective date.

Same-interval Plus → Business remains the immediate path described above.

## 25. Cancelling a scheduled change

While a Stripe-managed scheduled change is still pending, the owner can reverse it from **Account → Subscription**:

- scheduled cancellation → **Resume** (keeps the current paid plan and renewal date; no new Checkout)
- scheduled Business → Plus → **Keep Business** (releases the Stripe schedule)
- scheduled interval or combined change → cancel the schedule before it applies

Reversals need a successful Stripe confirmation. Apple-managed subscriptions do not use these Stripe actions.

## 26. Cancelling subscription

Cancel from **Account → Subscription**. Cancellation is scheduled for **paid period end** or **trial end**.

You keep the current paid (or trial) access until that date. Then the workspace becomes Basic.

Cancellation is **not** account deletion and **not** data deletion.

If you already canceled and access has not ended, use **Resume**.

## 27. Access until period end

Until the effective date you keep the current plan's features and limits. Plan locks from a lower plan do not apply early.

After the effective date, entitlement follows the new plan (Plus, or Basic after cancel/failure).

## 28. Trial behavior

A Business trial, **when enabled**, requires a payment method before it starts. Registration does not auto-start a trial.

If you do nothing, a started trial continues into **paid Business**. If you cancel before trial end, you keep Business until trial end, then become Basic without converting to paid Business.

**Current environment:** trial is {{TRIAL_STATUS}}. Exact duration is not a frozen public number independent of configuration (`BUSINESS_TRIAL_DAYS` is currently {{BUSINESS_TRIAL_DAYS}}). Do not assume a 7-day or 14-day trial unless this environment is configured for one.

## 29. Payment failure

The first failed recurring payment does **not** immediately downgrade the workspace.

Stripe retries according to Stripe. CheckStation does not run a separate retry engine.

## 30. Grace period

Current paid entitlement is kept for **{{PAYMENT_GRACE_DAYS}} days** after the failure that starts grace.

A warning email is sent once per day during grace (platform billing warning command; schedule that in deployment).

If payment recovers, grace is cleared and you stay on the paid plan.

## 31. Return to Basic after unresolved failure

If billing is still unresolved after grace and Stripe's final outcome, paid access ends and the workspace becomes **Basic**. Plan-lock rules then apply if usage is above Basic limits. Data is not auto-deleted.

After unpaid cancel or failed grace, you can subscribe again from Account when you are ready.

## 32. Plan-locked data after downgrade

If Members, Groups, or other usage exceed the new plan:

- extra items stay in the workspace
- they show as plan-locked
- you cannot open/launch/edit them in ways that keep over-limit usage
- you can archive extra items or upgrade to unlock them

See [Groups & Members](/groups-members).

## 33. No automatic data deletion on downgrade

Downgrade, cancel, and payment-failure return to Basic **never automatically delete** Members, Groups, Visitors, Classes, or Action Records.

## 34. Stripe purchases

Web paid subscriptions use Stripe (`purchase_source=stripe`):

- Checkout for new paid subscriptions
- Customer Portal for invoices, payment method, and some billing self-service
- in-app upgrade preview/apply, scheduled changes, cancel, and resume

Live Stripe credentials are configured in the deployed environment, not in public Docs.

## 35. Apple purchases

Account can store `purchase_source=apple`. For an Apple-managed subscription, CheckStation **hides Stripe portal and Stripe plan-change actions** and tells you to manage billing with Apple.

Apple in-app purchase checkout is **not implemented** in the current product. iOS/Android apps are not shipping in this slice.

## 36. Billing page

The owner opens **Account**:

- **Security** — login email, backup email, password, 2FA, account deletion
- **Subscription** — current plan, status, usage, upgrade/downgrade/cancel, renewal
- **Billing** — payment summary and Stripe Customer Portal when the purchase source is Stripe

Staff and Admin do not see owner billing.

## 37. Invoices and receipts

Stripe-hosted invoices and receipts are opened from **Account → Billing** (Customer Portal) for Stripe-managed subscriptions. CheckStation does not keep a second invented invoice store.

## 38. Customer portal

For `purchase_source=stripe`, Billing opens Stripe Customer Portal for payment method and invoices. Basic workspaces have no paid purchase source and no portal. Apple-managed workspaces do not open Stripe Portal.

## 39. Cancellation vs account deletion

| Action | What it does |
| --- | --- |
| Cancel subscription | Paid access ends at period/trial end; workspace becomes Basic; data remains |
| Delete account | Permanent owner/workspace deletion from Account → Security (Danger Zone). This is not a billing cancel |

You can cancel without deleting the account. Deleting the account is irreversible and is not the way to stop renewal.

## 40. Common billing questions

**Can Staff change the plan?** No. Owner only.

**Are records deleted when I downgrade?** No.

**When does a downgrade take effect?** End of the current paid period for Business → Plus and for interval/combined changes. Same-interval Plus → Business is immediate.

**Where are invoices?** Account → Billing, via Stripe Customer Portal for Stripe subscriptions.

**Why am I in a grace period?** A recurring payment failed. You keep paid access for {{PAYMENT_GRACE_DAYS}} days while Stripe retries.

**Can I switch monthly to yearly immediately?** No. Interval changes wait until period end.

More short answers: [FAQ](/faq).

## 41. Related docs

- [Getting Started](/getting-started) — new workspaces start on Basic
- [Groups & Members](/groups-members) — plan-locked Members and Groups
- [Kiosk Setup](/kiosk-setup) — ads around launch/exit on Basic
- [FAQ](/faq) — searchable billing questions
- [Terms of Use](/terms-of-use) — subscription agreement
- [Privacy Policy](/privacy-policy) — billing and account data
