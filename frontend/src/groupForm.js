import i18n from "./i18n/index.js";

export function formatGroupId(id) {
  if (id == null || id === "") {
    return "";
  }
  return i18n.t("groups:form.groupId", { id });
}

export function formatClassId(id) {
  if (id == null || id === "") {
    return "";
  }
  return i18n.t("groups:form.classId", { id });
}

export function isStructuredGroup(group) {
  return group?.group_type === "structured";
}

export function groupTypeLabel(group) {
  return isStructuredGroup(group)
    ? i18n.t("groups:type.structured")
    : i18n.t("groups:type.standard");
}

export function groupStatusLabel(group) {
  if (!group) {
    return "";
  }
  if (group.status === "archived") {
    return i18n.t("groups:status.archived");
  }
  if (group.readiness && !group.readiness.setup_complete) {
    return i18n.t("groups:status.setupIncomplete");
  }
  return i18n.t("groups:status.active");
}

export function setupIncompleteSummary(readiness) {
  if (!readiness || readiness.setup_complete) {
    return "";
  }
  const parts = [];
  if (readiness.missing_class_pin_count) {
    parts.push(
      i18n.t("groups:readiness.missingClassPin", {
        count: readiness.missing_class_pin_count,
      }),
    );
  }
  if (
    typeof readiness.launchable_class_count === "number" &&
    readiness.launchable_class_count === 0
  ) {
    parts.push(i18n.t("groups:readiness.noLaunchableClass"));
  }
  if (readiness.missing_pin_count) {
    parts.push(
      i18n.t("groups:readiness.missingPin", {
        count: readiness.missing_pin_count,
      }),
    );
  }
  if (readiness.missing_email_count) {
    parts.push(
      i18n.t("groups:readiness.missingEmail", {
        count: readiness.missing_email_count,
      }),
    );
  }
  return parts.join(" · ");
}

export function actionSummary(actions) {
  if (!actions) {
    return i18n.t("groups:actions.noneConfigured");
  }
  const parts = [];
  if (actions.check_in_enabled) {
    parts.push(i18n.t("groups:actions.checkIn"));
  }
  if (actions.check_out_enabled) {
    parts.push(i18n.t("groups:actions.checkOut"));
  }
  if (actions.breaks_enabled) {
    parts.push(i18n.t("groups:actions.breaksMax", { max: actions.max_breaks || 1 }));
  }
  return parts.length ? parts.join(" · ") : i18n.t("groups:actions.noneCheckInOutBreak");
}
