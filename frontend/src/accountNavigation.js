/**
 * Owner Account area navigation — Security / Subscription / Billing.
 */

export const ACCOUNT_SECTION_IDS = ["security", "subscription", "billing"];

export const ACCOUNT_SECTIONS = [
  {
    id: "security",
    label: "Security",
    path: "/account/security",
    description: "Login email, backup email, password, two-factor authentication, and account deletion.",
  },
  {
    id: "subscription",
    label: "Subscription",
    path: "/account/subscription",
    description: "Current plan, usage, and plan changes.",
  },
  {
    id: "billing",
    label: "Billing",
    path: "/account/billing",
    description: "Invoices, receipts, and payment details.",
  },
];

export const DEFAULT_ACCOUNT_SECTION = "security";

export function isAccountSectionId(value) {
  return ACCOUNT_SECTION_IDS.includes(value);
}

export function resolveAccountSection(value) {
  return isAccountSectionId(value) ? value : DEFAULT_ACCOUNT_SECTION;
}

export function accountSectionMeta(sectionId) {
  const id = resolveAccountSection(sectionId);
  return ACCOUNT_SECTIONS.find((section) => section.id === id) || ACCOUNT_SECTIONS[0];
}
