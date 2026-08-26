# Internal legal review (not public)

Privacy Policy and Terms of Use in this app are **launch-quality drafts**. They are the canonical product copy for development and staging. They are **not** a substitute for professional legal review.

Before production launch, have counsel review both documents for at least:

- Japan, including APPI and related privacy guidance
- consumer and subscription rules that apply to the jurisdictions where Check Station will be offered
- Apple App Store and Google Play requirements once those apps are offered
- any other jurisdiction where Check Station will be marketed

Do **not** put a “this is only a draft” banner on the public Docs site when the environment is intentionally showing this seeded content.

Unresolved business fields use settings placeholders (`LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_GOVERNING_LAW`, `LEGAL_GOVERNING_VENUE`). Fill those before launch rather than inventing a company name in Markdown.

Platform operators edit published documents in Django admin. `admin_notes` is internal-only and must never appear on the public API.
