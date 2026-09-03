# Privacy Policy

This Privacy Policy explains how {{LEGAL_OPERATOR_NAME}} ("we", "us", or "Check Station") handles information in connection with the Check Station service.

Check Station is a multi-tenant software platform that organizations use to configure and operate check-in, check-out, attendance, and related activity-tracking workflows. It is not a single-company time clock and is not limited to one industry.

If you do not agree with this Policy, do not use Check Station.

## 1. Scope

This Policy applies to:

- the Check Station website and workspace
- owner and workspace staff authentication
- kiosk operation as configured by a customer
- platform transactional email
- billing and subscription administration
- the public Status website and related public status data
- public documentation, Support, and legal pages
- the public Contact form and related Contact requests

This Policy does **not** make Check Station responsible for:

- information a customer collects or uses **outside** Check Station
- a customer's own privacy notices to its staff, members, students, visitors, or other participants
- content a customer sends through **customer-configured Group email** (SMTP or similar), except as described below

## 2. Who operates Check Station

Check Station is operated by {{LEGAL_OPERATOR_NAME}}.

A dedicated operator legal name, registered address, and principal place of business have not been designated in this Policy beyond the product identity **Check Station**. Until those details are designated, privacy inquiries may be directed to {{LEGAL_CONTACT_EMAIL}} or through the public Contact page on the Check Station website.

Platform transactional notices are sent from the configured Check Station account mailbox (currently used as `accounts@checkstation.app` unless a customer environment is configured otherwise). That address is a sending identity for account mail. It is not, by itself, a guaranteed inbound privacy helpdesk.

## 3. Roles: customer and Check Station

**Customers** (the paying workspace owner and the organization they operate) decide what people, Groups, kiosk settings, photos, and emails they put into Check Station. For participant and Member data entered by a customer, the customer is the organization that determines the purposes of that processing. Check Station provides the software used to store and process that data as a service.

**Check Station** determines the purposes of processing for:

- owner account registration and authentication
- workspace staff login infrastructure
- service security, abuse prevention, and platform administration
- billing and subscription records
- platform transactional email
- public status reporting (which does not include customer or participant personal data)

Customers remain responsible for having a lawful basis, notices, and any required consents for Member, participant, and other people data they enter, including where those people are children.

## 4. Definitions used in this Policy

- **Owner** — the paying Check Station user who owns exactly one Organization workspace.
- **Workspace / Organization** — the customer's tenant boundary and subscription boundary.
- **Workspace staff** — admin or staff logins created by the customer for that workspace. These are not Owner accounts and are not Members.
- **Member** — a person record the customer stores in the workspace. Members do not log into the workspace.
- **Participant** — a person checking in through a Group or Event kiosk, including Members and Group-only participants.
- **Action Record** — a historical record of a performed attendance or related action.
- **Kiosk** — the participant-facing interface owned by a Group (or Event, when that feature is used). It is not the workspace admin dashboard.

## 5. Information customers provide

### 5.1 Owner account information

When an owner registers or manages an account, Check Station processes:

- login email address
- password (stored as a password hash, not in recoverable form), when used
- optional Google or Apple sign-in identity when linked through Sign-in Methods
- email verification state and related timestamps
- optional backup email and verification state
- pending login-email changes and related timestamps
- optional owner two-factor authentication secrets, stored encrypted at rest

Newly registered paying owners must verify email before workspace access, except that platform operators using Django administration are not subject to that customer verification gate.

### 5.2 Workspace staff information

Customers may create workspace admin and staff accounts. Check Station stores:

- username (unique within that workspace)
- hashed password
- optional email (required for Admin role in the current product)
- role (admin or staff) and status
- timestamps and plan-related flags used by the product

Staff sign in with **Workspace ID + username + password**. They are not enrolled in the owner's email-verification flow. Staff two-factor authentication is not implemented.

### 5.3 Member and participant information

Customers control which fields they collect. The current product may store, depending on configuration:

- name (required for a Member)
- optional email, date of birth, phone, address, photo, and notes
- Group participation emails (limited in number by the product)
- attendance identifiers and attendance PINs as configured (attendance PINs are operational codes, not account passwords)
- Group-only participant records used without a reusable Member
- class/section attendance PINs for Structured Groups when that feature is enabled

Deprecated Member check-in identifier and PIN hash fields may still exist on stored records.

### 5.4 Attendance and Action Records

When a kiosk or authorized actor performs an action, Check Station creates an Action Record. Records may include:

- organization and Group context
- participant kind and identifiers as snapshots
- name, email, and identifier snapshots
- action type (for example check-in, check-out, break start, break end)
- source (for example kiosk, automatic, owner)
- timestamps and optional kiosk notes
- class/Group snapshots for Structured workflows

Check Station preserves historical Action Records during ordinary archive and deactivate operations. Permanent owner account deletion removes that workspace's operational Action Records as described in Section 14.

### 5.5 Kiosk configuration and session data

Customers configure kiosk behavior per Group, including identification methods, allowed actions, visual design, and logos or backgrounds. During kiosk use, Check Station uses the owner's or staff member's existing Check Station session cookie to lock that browser session into kiosk mode so the workspace dashboard is not exposed to participants.

Kiosk lock is session data. It is not a substitute for dedicated device credentials, which are not implemented.

### 5.6 Photos and other media

Customers may upload:

- Member and participant photos
- kiosk logos, backgrounds, and similar design media

Uploaded images are stored as workspace media. Check Station may resize or compress copies for display. Exact production image specifications remain open. Permanent account deletion removes that workspace's stored media files as implemented today.

### 5.7 Customer-configured email (Group SMTP)

Customers may configure a Group email sender (custom SMTP, Gmail app password, Microsoft 365 SMTP, or Yahoo app password) to send after-action or participation messages. Check Station stores sender host/port/security settings, username, from-name/from-address, and an **encrypted** SMTP password. Decrypted passwords are not returned by customer APIs.

Delivery audit records may include recipient, message kind, event type, status, and a short error summary. Those records belong to the customer's workspace.

Platform Email Delivery (Resend) is separate from customer SMTP. Public status reporting for "Email Delivery" refers to platform Resend, not a customer's Group SMTP.

### 5.8 Billing information

For paid plans, Check Station processes subscription state, plan, interval, purchase source (including Stripe or Apple where recorded), trial/grace/cancellation flags, and related billing identifiers needed to operate Checkout, Customer Portal, webhooks, and entitlements.

Card numbers are processed by the payment provider (currently Stripe for web checkout). Check Station is not designed to store full payment card numbers.

Apple In-App Purchase execution remains an open product item. Where a workspace purchase source is Apple, Check Station hides Stripe-managed billing controls for that workspace as implemented.

### 5.9 Contact and Support

The public **Support** hub on Docs is self-service. It searches the same canonical FAQ content used by the FAQ page and shows a compact public Status summary. It does not require an account.

The public **Contact** page (and later in-app Contact clients that use the same Contact API) collects:

- the category and subcategory you select
- email address
- optional name
- subject and message
- technical anti-spam data required to operate the form, which may include IP address used for rate limiting, Cloudflare Turnstile challenge results, and similar abuse-prevention metadata

Contact submissions are stored as Contact request records so a message is not lost if outbound email fails. Accepted submissions are emailed to the published Check Station contact address (`contact@checkstation.app` unless a deployment is configured otherwise). That address is a public routing address. Check Station does not publish a private forwarding mailbox in this Policy or in application configuration.

Privacy, legal, and data requests submitted through Contact are **captured and routed**. They are not automatically executed.

## 6. Information collected automatically

Check Station automatically processes:

- session cookies and CSRF tokens needed for browser authentication (see Section 7)
- security and application logs generated by the software
- public service-status probe results on the independent Status service (component names and public states only; not customer personal data)
- technical request metadata ordinary to operating a web application (for example, that a request occurred)
- for the public Contact form, IP address and related anti-spam signals used for rate limiting and bot protection

Check Station does **not** currently operate a third-party product-analytics product (for example a marketing analytics tag manager) as part of the documented architecture.

Advertising on the Basic plan currently uses a **mock** development provider. A real advertising network is not connected. When a real provider is introduced, this Policy will need to be updated to describe that sharing.

## 7. Cookies and session technologies

The Check Station workspace uses first-party cookies, including:

- `checkstation_sessionid` (HttpOnly) for the customer/workspace session
- `checkstation_csrftoken` (readable by the application) for CSRF protection
- isolated Django administration cookies on the `/admin` path (`checkstation_admin_sessionid` and `checkstation_admin_csrftoken`)

Cookie SameSite is configured as Lax in the current application settings. Production `Secure` cookie flags depend on deployment configuration and are not asserted here as universally enabled.

The public Status API and public content API do not require these cookies.

## 8. How we use information

We use information to:

- operate accounts, workspaces, kiosks, and attendance features
- authenticate owners and workspace staff and protect sessions
- send platform transactional email (verification, password reset, email-change notices, and billing notices such as payment-failure warnings during grace)
- process subscriptions, entitlements, plan limits, upgrades, downgrades, cancellations, and payment-provider events
- display advertising placements on **Basic** workspaces when the plan requires ads **and** the platform advertising kill switch is on (not during live participant kiosk operation)
- prevent fraud, abuse, and unauthorized access, including Contact-form rate limiting and bot protection
- receive and respond to Contact messages and privacy/legal requests (capture and routing only; requests are not automatically executed)
- comply with law and enforce the Terms of Use
- improve reliability and diagnose faults, including via the Status service

We do not use customer SMTP credentials to send Check Station marketing mail. We do not use Action Records to invent analytics by rewriting history.

## 9. Service providers

Depending on configuration, Check Station uses:

- **Resend** — platform transactional email, including delivery of Contact submissions to the published Check Station contact address
- **Cloudflare Turnstile** — bot protection for the public Contact form
- **Stripe** — web subscription checkout, customer portal, and related payment processing when Stripe is configured
- **hosting and infrastructure** used to run the application and databases (production hosting provider and region are not designated in this Policy)
- **Apple** — only if App Store billing is used; that live integration is not completed

These providers process data according to their terms and the instructions and configuration applicable to the Check Station deployment.

Customer-configured SMTP providers (Google, Microsoft, Yahoo, or a customer's own mail server) receive whatever the customer sends through Group email. That is the customer's processing, using credentials the customer supplied.

## 10. Advertising (Basic plan)

**Basic** workspaces may show ads. **Plus** and **Business** workspaces do not.

Current frozen web placements are: dashboard banner, Groups banner, before kiosk launch, after kiosk exit, and when leaving Kiosk Builder. Ads are **not** shown during live participant kiosk operation, and are not shown on Members, History, Staff, or Account surfaces as currently specified.

A platform operator can disable all advertising globally without changing workspace plans. Local development uses a mock provider. Because no live ad network is connected, this Policy does not claim sharing of personal data with an advertising network.

## 11. Children and minors

Check Station is sold to organizations. The product examples include schools and childcare, among other organization types. Members and participants generally do **not** create Check Station owner accounts.

Check Station does not provide an age-gate for participants. Customers who enter information about children are responsible for complying with applicable children's privacy and education-privacy laws, including obtaining any required parental or guardian consent and providing any required notices. Check Station does not claim COPPA, GDPR-K, or similar certification.

If we learn that an **owner account** was created by a child in violation of the Terms, we may delete that account.

## 12. International processing

Check Station may be accessed from more than one country. Production hosting region is not designated in this Policy. Information may be processed in whatever country the then-current infrastructure occupies.

Customers in Japan remain responsible for their own obligations under the Act on the Protection of Personal Information (APPI) and related guidelines for the personal data they decide to collect. This Policy is not a substitute for a customer's APPI notice to data subjects.

## 13. Retention

Check Station retains account and workspace data while the workspace exists.

Archive and deactivate are the ordinary reversible paths and are designed to **preserve** history, including Action Records.

A documented numeric retention schedule for Action Records after archive, and a legal-hold/compliance retention system after deletion, are **not implemented**. This Policy therefore does not claim a specific year-count for logs or attendance history.

Local development databases persist on disk volumes; that is not a production backup policy.

## 14. Deletion

Owners may permanently delete their Check Station account when no live paid subscription blocks deletion. The built-in free Business trial alone does not block deletion.

Permanent deletion is owner-only (or a platform superuser in administration), requires sensitive confirmation (password re-entry, or provider re-authentication for OAuth-only owners), and is irreversible in the product.

A live paid subscription (including cancel-at-period-end while paid access continues) blocks permanent deletion until paid access actually ends. Deleting the account does **not** cancel Stripe billing automatically.

As implemented, permanent deletion removes the paying user, the Organization, workspace staff, Members, Groups, kiosk configuration, Group email senders and delivery audit rows, Action Records for that workspace, and stored media for that workspace.

Subscription cancellation is **not** account deletion. Canceling billing may limit or end paid service while data remains until the owner deletes the account or another retention rule applies.

After true deletion, the owner's email may be registered again as a new account. Prior verification tokens cannot restore the deleted user.

Stripe or other provider objects may still exist at the provider until canceled or deleted there. The current deletion implementation does not document a guaranteed provider-side wipe.

## 15. Security

Check Station uses access controls, password hashing, CSRF protection, isolated admin sessions, optional owner TOTP, mandatory platform-admin TOTP for Django administration, encryption of certain secrets at rest (including TOTP secrets and Group SMTP passwords), and kiosk session lock to keep the workspace UI away from participants.

Attendance PINs and class PINs are operational codes stored using one-way hashing. Managers can set, change, or reset them, but the product does not display saved PIN values. They are not equivalent to login passwords.

No method of transmission or storage is completely secure. Check Station does not guarantee absolute security and does not claim a specific certification (for example ISO 27001 or SOC 2) in this Policy.

## 16. Privacy rights

Depending on where you live, you may have rights to access, correct, or delete personal data, or to object to certain processing.

- **Owners** can access and update much of their account data in Account settings and can request permanent deletion as described above.
- **Workspace staff and Members / participants** should contact the **customer organization** that entered their data. Check Station generally cannot verify a participant's identity independently of the customer.
- **Japan:** if APPI rights apply to you as a data subject of a customer, exercise them with that customer unless your request concerns data Check Station processes as operator of your **owner** account.

We may refuse requests that are unfounded, repetitive, or that would violate another person's rights or the security of the service.

## 17. Legal requests

We may disclose information if we believe it is required by law, legal process, or to protect Check Station, customers, or individuals from harm. We do not publish a law-enforcement guidelines document in this version.

## 18. Changes

We may update this Policy. The version, last-updated timestamp, and effective date published through the Check Station content API (and shown on this page) are the current public metadata. Material changes take effect on the stated effective date. Continued use after that date constitutes acceptance of the updated Policy where permitted by law.

Because this document is canonical, changing it in the Check Station content system updates the public Docs site and any future in-app viewers that fetch the same API. It does not require a separate copy in each frontend.

## 19. Contact

Privacy questions about Check Station as a service: {{LEGAL_CONTACT_EMAIL}}, or the public Contact page on the Check Station website (category Privacy & Data).

Questions about a school's, employer's, or club's use of Check Station, including a request about a Member or participant record, should be directed to that organization.
