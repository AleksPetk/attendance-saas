# CheckStation Localization Architecture (Phase 1)

Internal developer reference for UI language (`en` / `ja`). This document describes the i18n foundation only — not billing markets, currency, docs, status, or marketing locale routes.

## Supported locale keys

| Key | Language |
|-----|----------|
| `en` | English (default / fallback) |
| `ja` | Japanese |

Canonical values only. Regional tags are normalized:

- `en-US`, `en-GB` → `en`
- `ja-JP` → `ja`
- Unknown → `en`

## Language is not billing market. Language is not currency.

UI language is independent of:

- Stripe price currency (today: USD catalog)
- Billing market / country
- Timezone
- Geo detection

Valid combinations include:

- **Japanese UI + USD billing** — a Japanese-speaking owner paying USD list prices
- **English UI + JPY billing** — possible in a future market without changing this document’s locale keys

Never infer `JPY` from `ja` or `USD` from `en` in application code.

## Translation files

Frontend namespaces live under:

```
frontend/src/i18n/locales/
  en/
    common.json
    auth.json
    workspace.json
    billing.json
    kiosk.json
  ja/
    (same structure)
```

Bootstrap: `frontend/src/i18n/index.js` (i18next init).

Utilities:

- `frontend/src/i18n/language.js` — normalization, supported locales
- `frontend/src/i18n/storage.js` — browser persistence
- `frontend/src/i18n/format.js` — `Intl` date/number/currency helpers
- `frontend/src/i18n/LanguageProvider.jsx` — `useLanguage()`, `setLanguage()`
- `frontend/src/i18n/LanguageSwitcher.jsx` — reusable selector

## Adding a translation string

1. Choose a namespace (`common`, `auth`, `workspace`, `billing`, `kiosk`).
2. Add the key to `locales/en/<namespace>.json`.
3. Add the Japanese value to `locales/ja/<namespace>.json`.
4. Use in React:

```jsx
import { useTranslation } from "react-i18next";

const { t } = useTranslation("workspace");
return <span>{t("accountSections.security")}</span>;
```

5. Missing Japanese keys fall back to English via i18next `fallbackLng: "en"`. In development, missing keys log a console warning (not shown in UI).

## Adding a future language

1. Add the canonical key to `SUPPORTED_LOCALES` in `frontend/src/i18n/language.js`.
2. Add backend `PreferredLanguage` choice and validation in `backend/accounts/language.py` and `User.preferred_language`.
3. Create `frontend/src/i18n/locales/<lang>/` JSON files for each namespace.
4. Register resources in `frontend/src/i18n/index.js`.
5. Add a label in `LOCALE_LABELS`.

## Language resolution order (Phase 1)

### Unauthenticated visitors

1. Explicit saved browser preference (`localStorage` key `checkstation.locale` when `checkstation.locale.explicit = 1`)
2. Browser locale if supported (`en` or `ja`)
3. English fallback

Browser locale does **not** override an explicit saved preference.

### Authenticated owners

When workspace session loads, `preferred_language` from the backend becomes authoritative.

When the owner changes language:

1. UI updates immediately (i18next)
2. Preference saved to `localStorage` (explicit)
3. `PATCH /api/auth/account/` with `{ "preferred_language": "en" | "ja" }`

On logout, the browser preference is **not** cleared.

### Workspace staff (Phase 1)

No `preferred_language` on `WorkspaceStaffAccount`. Staff use browser/local persistence only. Owner backend preference is the only persisted user language in this phase.

## Backend owner preference

- **Model:** `accounts.User.preferred_language` (`en` | `ja`, default `en`)
- **Read:** `GET /api/auth/account/`, `GET /api/workspace/` (owner payloads)
- **Write:** `PATCH /api/auth/account/` body `{ "preferred_language": "en" | "ja" }`
- **Errors:** `{ "code": "invalid_preferred_language", "detail": "...", "preferred_language": [...] }`

Normalization: `backend/accounts/language.py`.

## API error convention (localization prep)

Prefer stable machine-readable `code` values alongside human-readable `detail` text. New localization endpoints follow this pattern. Existing endpoints remain compatible; full API string localization is a later phase.

## HTML `lang`

`document.documentElement.lang` is set to `en` or `ja` when the active locale changes (`localeHtmlLang()`).

## Formatting helpers

```js
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "./i18n/format.js";

formatCurrency(9.99, { locale: "ja", currency: "USD" });
formatCurrency(1200, { locale: "en", currency: "JPY" });
```

Currency is always passed explicitly — never derived from UI language.
