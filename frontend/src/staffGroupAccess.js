import { createElement as h } from "react";

export const STAFF_GROUP_ACCESS_FILTERS = [
  { id: "all", label: "All" },
  { id: "selected", label: "Selected" },
  { id: "unselected", label: "Unselected" },
  { id: "standard", label: "Standard" },
  { id: "structured", label: "Structured" },
];

export function groupTypeBadgeLabel(groupType) {
  return groupType === "structured" ? "Structured" : "Standard";
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
    { className: "staff-card-access", "aria-label": "Current Group access" },
    h("span", { className: "staff-card-access-label" }, "Group access"),
    visible.length === 0
      ? h("span", { className: "staff-card-access-empty" }, "No Group access")
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
                  title: `${remaining} additional Group${remaining === 1 ? "" : "s"}`,
                },
                `+${remaining} more`,
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
  if (!workspaceHasGroups) return "No active Groups are available.";
  if (visibleCount > 0) return "";
  if (String(search || "").trim()) return "No Groups match your search.";
  if (filter === "selected") return "No Groups selected.";
  if (filter === "unselected") return "No unselected Groups.";
  return "No Groups match your search.";
}

export function selectedCountLabel(count) {
  return `${count} selected`;
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
      h("h4", { id: "staff-group-access-title" }, `Group access — ${username}`),
      h(
        "p",
        { className: "hint" },
        "Choose which Groups this Staff account can view and operate.",
      ),
    ),
    h(
      "div",
      { className: "staff-group-access-toolbar" },
      h(
        "label",
        { className: "staff-group-access-search" },
        h("span", { className: "staff-group-access-search-label" }, "Search groups"),
        h("input", {
          type: "search",
          value: search,
          onChange: (event) => onSearchChange(event.target.value),
          placeholder: "Search groups...",
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
      { className: "staff-group-access-filters", role: "group", "aria-label": "Filter groups" },
      STAFF_GROUP_ACCESS_FILTERS.map((option) =>
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
        "Select all visible",
      ),
      h(
        "button",
        {
          type: "button",
          className: "btn-ghost btn-sm",
          onClick: onClearSelection,
          disabled: selectedCount === 0,
        },
        "Clear selection",
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
          "Cancel",
        ),
        h(
          "button",
          {
            type: "button",
            className: "btn-primary btn-sm",
            disabled: !dirty || saving,
            onClick: onSave,
          },
          saving ? "Saving…" : "Save access",
        ),
      ),
    ),
  );
}
