import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enAccount from "./locales/en/account.json" with { type: "json" };
import enAuth from "./locales/en/auth.json" with { type: "json" };
import enBilling from "./locales/en/billing.json" with { type: "json" };
import enCommon from "./locales/en/common.json" with { type: "json" };
import enEntitlements from "./locales/en/entitlements.json" with { type: "json" };
import enErrors from "./locales/en/errors.json" with { type: "json" };
import enGroups from "./locales/en/groups.json" with { type: "json" };
import enHistory from "./locales/en/history.json" with { type: "json" };
import enKiosk from "./locales/en/kiosk.json" with { type: "json" };
import enMembers from "./locales/en/members.json" with { type: "json" };
import enStaff from "./locales/en/staff.json" with { type: "json" };
import enWorkspace from "./locales/en/workspace.json" with { type: "json" };
import jaAccount from "./locales/ja/account.json" with { type: "json" };
import jaAuth from "./locales/ja/auth.json" with { type: "json" };
import jaBilling from "./locales/ja/billing.json" with { type: "json" };
import jaCommon from "./locales/ja/common.json" with { type: "json" };
import jaEntitlements from "./locales/ja/entitlements.json" with { type: "json" };
import jaErrors from "./locales/ja/errors.json" with { type: "json" };
import jaGroups from "./locales/ja/groups.json" with { type: "json" };
import jaHistory from "./locales/ja/history.json" with { type: "json" };
import jaKiosk from "./locales/ja/kiosk.json" with { type: "json" };
import jaMembers from "./locales/ja/members.json" with { type: "json" };
import jaStaff from "./locales/ja/staff.json" with { type: "json" };
import jaWorkspace from "./locales/ja/workspace.json" with { type: "json" };
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./language.js";
import { resolveInitialLocale } from "./storage.js";

const isDev = Boolean(import.meta.env?.DEV);

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    workspace: enWorkspace,
    billing: enBilling,
    kiosk: enKiosk,
    members: enMembers,
    groups: enGroups,
    history: enHistory,
    staff: enStaff,
    account: enAccount,
    entitlements: enEntitlements,
    errors: enErrors,
  },
  ja: {
    common: jaCommon,
    auth: jaAuth,
    workspace: jaWorkspace,
    billing: jaBilling,
    kiosk: jaKiosk,
    members: jaMembers,
    groups: jaGroups,
    history: jaHistory,
    staff: jaStaff,
    account: jaAccount,
    entitlements: jaEntitlements,
    errors: jaErrors,
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: resolveInitialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES,
  ns: [
    "common",
    "auth",
    "workspace",
    "billing",
    "kiosk",
    "members",
    "groups",
    "history",
    "staff",
    "account",
    "entitlements",
    "errors",
  ],
  defaultNS: "common",
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
  returnEmptyString: false,
  missingKeyHandler(lngs, ns, key) {
    if (isDev) {
      console.warn(`[i18n] Missing translation: ${ns}:${key} (${lngs.join(", ")})`);
    }
  },
});

export default i18n;
