import { createElement } from "react";
import { workspacePlanDisplayName, workspacePlanKey } from "./workspaceEntitlements.js";
import { workspaceRoleLabel } from "./workspaceSession.js";

/** Effective workspace access plan for sidebar display (entitlements-backed). */
export function sidebarEffectivePlan(session) {
  return {
    key: workspacePlanKey(session),
    label: workspacePlanDisplayName(session),
  };
}

export function SidebarAccountChip({ session }) {
  const workspace = session?.workspace || {};
  const roleLabel = workspaceRoleLabel(session);
  const plan = sidebarEffectivePlan(session);

  return createElement(
    "div",
    { className: "account-chip" },
    createElement("span", { className: "account-email" }, workspace.identity || ""),
    createElement(
      "div",
      { className: "account-role-line" },
      createElement("span", { className: "account-role-label" }, roleLabel),
      createElement("span", { className: "account-role-sep", "aria-hidden": true }, "·"),
      createElement(
        "span",
        {
          className: `sidebar-plan-badge is-${plan.key}`,
          "data-tutorial-target": "workspace-plan-badge",
        },
        plan.label,
      ),
    ),
  );
}
