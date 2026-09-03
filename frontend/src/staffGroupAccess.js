import { createElement as h } from "react";

import i18n from "./i18n/index.js";

export function staffGroupAccessFilters() {
  return [
    { id: "all", label: i18n.t("staff:groupAccess.filters.all") },
    { id: "selected", label: i18n.t("staff:groupAccess.filters.selected") },
    { id: "unselected", label: i18n.t("staff:groupAccess.filters.unselected") },
    { id: "standard", label: i18n.t("staff:groupAccess.filters.standard") },
    { id: "structured", label: i18n.t("staff:groupAccess.filters.structured") },
  ];
}

export function groupTypeBadgeLabel(groupType) {
  return groupType === "structured"
    ? i18n.t("staff:groupAccess.groupTypeStructured")
    : i18n.t("staff:groupAccess.groupTypeStandard");
}

export function selectedGroupCount(items) {
  return (items || []).filter((item) => item.assigned).length;
}

export function assignedGroupIds(items) {
  return (items || [])
    .filter((item) => item.assigned)
    .map((item) => item.group_id)
    .sort((left, right) => left - right);
}

export function assignedGroupSummary(items) {
  return (items || [])
    .filter((item) => item.assigned)
    .map((item) => ({
      group_id: item.group_id,
      name: item.name,
      group_type: item.group_type,
    }));
}

export function compactGroupAccess(groups, visibleLimit = 3) {
  const normalized = Array.isArray(groups) ? groups : [];
  const limit = Math.max(0, Number(visibleLimit) || 0);
  return {
    visible: normalized.slice(0, limit),
    remaining: Math.max(0, normalized.length - limit),
  };
}

export function updateStaffGroupAccessSummary(accounts, staffId, savedItems) {
  const savedAccess = assignedGroupSummary(savedItems);
  return (accounts || []).map((account) =>
    account.id === staffId ? { ...account, group_access: savedAccess } : account,
  );
}

export async function saveStaffGroupAccessFlow({
  staffId,
  items,
  saveAccess,
  onSaved,
  onClose,
}) {
  const groupIds = assignedGroupIds(items);
  const result = await saveAccess(staffId, { group_ids: groupIds });
  const savedItems = result.data?.items || [];
  onSaved(savedItems, groupIds);
  onClose();
  return savedItems;
}

export function StaffGroupAccessSummary({ groups, visibleLimit = 3 }) {
  const { visible, remaining } = compactGroupAccess(groups, visibleLimit);
  return h(
    "div",
    { className: "staff-card-access", "aria-label": i18n.t("staff:groupAccess.currentAriaLabel") },
    h("span", { className: "staff-card-access-label" }, i18n.t("staff:groupAccess.label")),
    visible.length === 0
      ? h("span", { className: "staff-card-access-empty" }, i18n.t("staff:groupAccess.empty"))
      : h(
          "div",
          { className: "staff-card-access-chips" },
          visible.map((group) =>
            h(
              "span",
              { key: group.group_id, className: "staff-card-access-chip", title: group.name },
              group.name,
            ),
          ),
          remaining > 0
            ? h(
                "span",
                {
                  className: "staff-card-access-more",
                  title: i18n.t("staff:groupAccess.moreTitle", { count: remaining }),
                },
                i18n.t("staff:groupAccess.more", { count: remaining }),
              )
            : null,
        ),
  );
}

export function sameAssignedIds(left, right) {
  const a = [...(left || [])].sort((x, y) => x - y);
  const b = [...(right || [])].sort((x, y) => x - y);
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

export function groupAccessIsDirty(items, baselineIds) {
  return !sameAssignedIds(assignedGroupIds(items), baselineIds);
}

export function filterStaffGroupAccessItems(items, { search = "", filter = "all" } = {}) {
  const query = String(search || "").trim().toLowerCase();
  return (items || []).filter((item) => {
    const name = String(item.name || "");
    if (query && !name.toLowerCase().includes(query)) return false;
    if (filter === "selected") return Boolean(item.assigned);
    if (filter === "unselected") return !item.assigned;
    if (filter === "standard") return item.group_type !== "structured";
    if (filter === "structured") return item.group_type === "structured";
    return true;
  });
}

export function toggleStaffGroupAssignment(items, groupId) {
  return (items || []).map((item) =>
    item.group_id === groupId ? { ...item, assigned: !item.assigned } : item,
  );
}

export function selectVisibleStaffGroups(items, visibleIds) {
  const visible = new Set(visibleIds || []);
  return (items || []).map((item) =>
    visible.has(item.group_id) ? { ...item, assigned: true } : item,
  );
}

export function clearStaffGroupSelection(items) {
  return (items || []).map((item) => ({ ...item, assigned: false }));
}

export function restoreStaffGroupSelection(items, baselineIds) {
  const baseline = new Set(baselineIds || []);
  return (items || []).map((item) => ({
    ...item,
    assigned: baseline.has(item.group_id),
  }));
}

export function staffGroupAccessEmptyMessage({
  workspaceHasGroups,
  visibleCount,
  filter = "all",
  search = "",
} = {}) {
  if (!workspaceHasGroups) return i18n.t("staff:groupAccess.emptyNoGroups");
  if (visibleCount > 0) return "";
  if (String(search || "").trim()) return i18n.t("staff:groupAccess.emptyNoSearchResults");
  if (filter === "selected") return i18n.t("staff:groupAccess.emptyNoSelected");
  if (filter === "unselected") return i18n.t("staff:groupAccess.emptyNoUnselected");
  return i18n.t("staff:groupAccess.emptyNoSearchResults");
}

export function selectedCountLabel(count) {
  return i18n.t("staff:groupAccess.selectedCount", { count });
}

export function StaffGroupAccessPanel({
  username,
  items,
  baselineIds,
  search,
  filter,
  saving = false,
  savedNotice = "",
  onSearchChange,
  onFilterChange,
  onToggleGroup,
  onSelectVisible,
  onClearSelection,
  onSave,
  onCancel,
}) {
  const visibleItems = filterStaffGroupAccessItems(items, { search, filter });
  const selectedCount = selectedGroupCount(items);
  const dirty = groupAccessIsDirty(items, baselineIds);
  const emptyMessage = staffGroupAccessEmptyMessage({
    workspaceHasGroups: (items || []).length > 0,
    visibleCount: visibleItems.length,
    filter,
    search,
  });

  return h(
    "section",
    {
      className: "staff-group-access",
      "aria-labelledby": "staff-group-access-title",
      "data-tutorial-target": "staff-group-access",
    },
    h(
      "header",
      { className: "staff-group-access-header" },
      h(
        "h4",
        { id: "staff-group-access-title" },
        i18n.t("staff:groupAccess.title", { username }),
      ),
      h(
        "p",
        { className: "hint" },
        i18n.t("staff:groupAccess.description"),
      ),
    ),
    h(
      "div",
      { className: "staff-group-access-toolbar" },
      h(
        "label",
        { className: "staff-group-access-search" },
        h("span", { className: "staff-group-access-search-label" }, i18n.t("staff:groupAccess.searchLabel")),
        h("input", {
          type: "search",
          value: search,
          onChange: (event) => onSearchChange(event.target.value),
          placeholder: i18n.t("staff:groupAccess.searchPlaceholder"),
          autoComplete: "off",
        }),
      ),
      h(
        "p",
        { className: "staff-group-access-count", "aria-live": "polite" },
        selectedCountLabel(selectedCount),
      ),
    ),
    h(
      "div",
      { className: "staff-group-access-filters", role: "group", "aria-label": i18n.t("staff:groupAccess.filterAriaLabel") },
      staffGroupAccessFilters().map((option) =>
        h(
          "button",
          {
            key: option.id,
            type: "button",
            className: `staff-group-access-filter${filter === option.id ? " is-active" : ""}`,
            "aria-pressed": filter === option.id,
            onClick: () => onFilterChange(option.id),
          },
          option.label,
        ),
      ),
    ),
    h(
      "div",
      { className: "staff-group-access-bulk" },
      h(
        "button",
        {
          type: "button",
          className: "btn-ghost btn-sm",
          onClick: () => onSelectVisible(visibleItems.map((item) => item.group_id)),
          disabled: visibleItems.length === 0,
        },
        i18n.t("staff:groupAccess.selectAllVisible"),
      ),
      h(
        "button",
        {
          type: "button",
          className: "btn-ghost btn-sm",
          onClick: onClearSelection,
          disabled: selectedCount === 0,
        },
        i18n.t("staff:groupAccess.clearSelection"),
      ),
    ),
    h(
      "div",
      { className: "staff-group-access-scroll" },
      emptyMessage
        ? h("p", { className: "staff-group-access-empty" }, emptyMessage)
        : h(
            "ul",
            { className: "staff-group-access-list" },
            visibleItems.map((item) =>
              h(
                "li",
                { key: item.group_id },
                h(
                  "label",
                  {
                    className: `staff-group-access-row${item.assigned ? " is-selected" : ""}`,
                  },
                  h("input", {
                    type: "checkbox",
                    checked: Boolean(item.assigned),
                    onChange: () => onToggleGroup(item.group_id),
                    "aria-label": item.name,
                  }),
                  h("span", { className: "staff-group-access-name" }, item.name),
                  h(
                    "span",
                    {
                      className: `staff-group-access-type is-${item.group_type === "structured" ? "structured" : "standard"}`,
                    },
                    groupTypeBadgeLabel(item.group_type),
                  ),
                ),
              ),
            ),
          ),
    ),
    h(
      "footer",
      { className: "staff-group-access-footer" },
      savedNotice
        ? h("p", { className: "staff-group-access-saved", role: "status" }, savedNotice)
        : h("span"),
      h(
        "div",
        { className: "staff-group-access-actions" },
        h(
          "button",
          { type: "button", className: "btn-secondary btn-sm", onClick: onCancel },
          i18n.t("common:cancel"),
        ),
        h(
          "button",
          {
            type: "button",
            className: "btn-primary btn-sm",
            disabled: !dirty || saving,
            onClick: onSave,
          },
          saving ? i18n.t("staff:groupAccess.saving") : i18n.t("staff:groupAccess.save"),
        ),
      ),
    ),
  );
}
