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

export function visibleAccountSectionIds(session) {
  const caps = session?.workspace?.capabilities || {};
  const canView = Boolean(caps.can_view_billing);
  const canManage =
    "can_manage_subscription" in caps
      ? Boolean(caps.can_manage_subscription)
      : canView;
  if (canView && canManage) return ACCOUNT_SECTION_IDS;
  return ["security"];
}

export function visibleAccountSections(session) {
  const allowed = new Set(visibleAccountSectionIds(session));
  return ACCOUNT_SECTIONS.filter((section) => allowed.has(section.id));
}

export function isAccountSectionId(value, session = null) {
  if (session) return visibleAccountSectionIds(session).includes(value);
  return ACCOUNT_SECTION_IDS.includes(value);
}

export function resolveAccountSection(value, session = null) {
  return isAccountSectionId(value, session) ? value : DEFAULT_ACCOUNT_SECTION;
}

export function accountSectionMeta(sectionId, session = null) {
  const id = resolveAccountSection(sectionId, session);
  const sections = session ? visibleAccountSections(session) : ACCOUNT_SECTIONS;
  return sections.find((section) => section.id === id) || ACCOUNT_SECTIONS[0];
}
