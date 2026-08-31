/**
 * Owner Account area navigation — Security / Subscription / Billing / Info / Tutorial / Status.
 */

export const ACCOUNT_SECTION_IDS = ["security", "subscription", "billing", "info", "tutorial", "status"];

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
  {
    id: "info",
    label: "Info",
    path: "/account/info",
    description: "Documentation, legal information, and help from CheckStation.",
  },
  {
    id: "tutorial",
    label: "Tutorial",
    path: "/account/tutorial",
    description: "Replay the Workspace introduction or choose a focused guided tutorial.",
  },
  {
    id: "status",
    label: "Status",
    path: "/account/status",
    description: "Live CheckStation service health, incidents, and scheduled maintenance.",
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
  return ["security", "info", "tutorial", "status"];
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
