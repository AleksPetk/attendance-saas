import { createElement } from "react";

function StatusPills({ pills }) {
  if (!pills?.length) return null;
  return createElement(
    "span",
    { className: "account-settings-pills" },
    pills.map((pill) =>
      createElement(
        "span",
        {
          key: pill.label,
          className: `badge badge-${pill.variant || "default"}`,
        },
        pill.label,
      ),
    ),
  );
}

/**
 * Shared Account settings section.
 *
 * Collapsible when `onToggle` is provided; otherwise a static settings card
 * with the same shell, title, subtitle, and optional status pills.
 */
export function AccountSettingsSection({
  id,
  title,
  description,
  statusSummary = "",
  statusPills = null,
  isOpen = false,
  onToggle = null,
  variant = "default",
  children,
}) {
  const panelId = `account-settings-${id}`;
  const triggerId = `${panelId}-trigger`;
  const collapsible = typeof onToggle === "function";
  const open = collapsible ? Boolean(isOpen) : true;
  const showCollapsedMeta = collapsible && !open;
  const shellClass = [
    "account-settings-section",
    open ? "is-open" : "",
    collapsible ? "is-collapsible" : "is-static",
    `tone-${variant}`,
  ]
    .filter(Boolean)
    .join(" ");

  const titleBlock = createElement(
    "span",
    { className: "account-settings-trigger-main" },
    createElement("span", { className: "account-settings-title" }, title),
    description
      ? createElement("span", { className: "account-settings-description" }, description)
      : null,
    showCollapsedMeta && statusSummary
      ? createElement("span", { className: "account-settings-status" }, statusSummary)
      : null,
    showCollapsedMeta || !collapsible
      ? createElement(StatusPills, { pills: statusPills })
      : null,
  );

  const header = collapsible
    ? createElement(
        "button",
        {
          type: "button",
          className: "account-settings-trigger",
          "aria-expanded": open,
          "aria-controls": panelId,
          id: triggerId,
          onClick: onToggle,
        },
        titleBlock,
        createElement("span", { className: "account-settings-chevron", "aria-hidden": "true" }, "▾"),
      )
    : createElement(
        "div",
        { className: "account-settings-header", id: triggerId },
        titleBlock,
      );

  const body =
    open && children
      ? createElement(
          "div",
          {
            id: panelId,
            className: "account-settings-panel",
            role: collapsible ? "region" : undefined,
            "aria-labelledby": triggerId,
          },
          children,
        )
      : null;

  return createElement("section", { className: shellClass }, header, body);
}

/** @deprecated Use AccountSettingsSection */
export const AccountAccordionSection = AccountSettingsSection;
