import { createElement, useMemo, useState } from "react";
import i18n from "./i18n/index.js";

function t(key, options) {
  return i18n.t(key, { ns: "workspace", ...options });
}

function tEnt(key, options) {
  return i18n.t(key, { ns: "entitlements", ...options });
}

function tCommon(key, options) {
  return i18n.t(key, { ns: "common", ...options });
}

export function requiredPlanSelectionCount(limit, candidateCount) {
  return Math.min(Math.max(0, Number(limit) || 0), Math.max(0, Number(candidateCount) || 0));
}

export function candidateDisplayName(candidate) {
  return (
    candidate?.name ||
    candidate?.username ||
    tEnt("planLockCandidates.recordNumber", { id: candidate?.id })
  );
}

export function candidateMeta(candidate) {
  return [
    candidate?.group_type === "structured" ? tEnt("planLockCandidates.structuredGroup") : null,
    candidate?.group_type === "standard" ? tEnt("planLockCandidates.standardGroup") : null,
    candidate?.role === "admin" ? tEnt("planLockCandidates.workspaceAdmin") : null,
    candidate?.role === "staff" ? tEnt("planLockCandidates.workspaceStaff") : null,
    candidate?.email || null,
    candidate?.status || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function filterPlanLockCandidates(candidates, search) {
  const query = String(search || "").trim().toLowerCase();
  if (!query) return candidates || [];
  return (candidates || []).filter((candidate) => {
    const haystack = [
      candidateDisplayName(candidate),
      candidate?.email,
      candidate?.username,
      candidate?.status,
      candidate?.id != null ? String(candidate.id) : "",
      candidate?.id != null ? `#${candidate.id}` : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function PlanLockSelectionForm({
  title,
  description,
  selection,
  selectedIds,
  onSelectedIdsChange,
  onConfirm,
  onCancel,
  saving = false,
  enableSearch = false,
}) {
  const [search, setSearch] = useState("");
  const candidates = selection?.candidates || [];
  const limit = Math.max(0, Number(selection?.limit) || 0);
  const requiredCount = requiredPlanSelectionCount(limit, candidates.length);
  const valid = selectedIds.length === requiredCount;
  const visibleCandidates = useMemo(
    () => (enableSearch ? filterPlanLockCandidates(candidates, search) : candidates),
    [candidates, enableSearch, search],
  );

  function toggleCandidate(id) {
    if (selectedIds.includes(id)) {
      onSelectedIdsChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else if (selectedIds.length < limit) {
      onSelectedIdsChange([...selectedIds, id]);
    }
  }

  return createElement(
    "section",
    {
      className: "plan-lock-selection-panel",
      "aria-labelledby": "plan-lock-selection-title",
    },
    createElement(
      "header",
      { className: "plan-lock-selection-header" },
      createElement(
        "div",
        null,
        createElement("p", { className: "entity-kicker" }, t("planLock.kicker")),
        createElement("h2", { id: "plan-lock-selection-title" }, title),
        createElement("p", null, description),
      ),
      createElement(
        "strong",
        { className: "plan-lock-selection-count" },
        t("planLock.selectedCount", { selected: selectedIds.length, limit }),
      ),
    ),
    enableSearch
      ? createElement("input", {
          className: "search-input plan-lock-selection-search",
          type: "search",
          placeholder: t("planLock.searchPlaceholder"),
          value: search,
          onChange: (event) => setSearch(event.target.value),
          "aria-label": t("planLock.searchAria"),
        })
      : null,
    candidates.length
      ? createElement(
          "div",
          { className: "plan-lock-candidate-list" },
          visibleCandidates.length
            ? visibleCandidates.map((candidate) => {
                const checked = selectedIds.includes(candidate.id);
                const disabled = !checked && selectedIds.length >= limit;
                const meta = candidateMeta(candidate);
                return createElement(
                  "label",
                  {
                    key: candidate.id,
                    className: `plan-lock-candidate${checked ? " is-selected" : ""}${
                      disabled ? " is-disabled" : ""
                    }`,
                  },
                  createElement("input", {
                    type: "checkbox",
                    checked,
                    disabled,
                    onChange: () => toggleCandidate(candidate.id),
                  }),
                  createElement(
                    "span",
                    null,
                    createElement("strong", null, candidateDisplayName(candidate)),
                    meta ? createElement("small", null, meta) : null,
                  ),
                );
              })
            : createElement(
                "p",
                { className: "plan-lock-selection-empty" },
                t("planLock.noMatches"),
              ),
        )
      : createElement(
          "p",
          { className: "plan-lock-selection-empty" },
          t("planLock.noRecords"),
        ),
    createElement(
      "p",
      { className: "plan-lock-selection-guidance" },
      t(requiredCount === 1 ? "planLock.guidance" : "planLock.guidance_plural", { count: requiredCount }),
    ),
    createElement(
      "div",
      { className: "plan-lock-selection-actions" },
      createElement(
        "button",
        {
          type: "button",
          className: "btn-primary",
          disabled: !valid || saving,
          onClick: onConfirm,
        },
        saving ? tCommon("saving") : t("planLock.confirmAvailability"),
      ),
      onCancel
        ? createElement(
            "button",
            {
              type: "button",
              className: "btn-secondary",
              disabled: saving,
              onClick: onCancel,
            },
            tCommon("cancel"),
          )
        : null,
    ),
  );
}
