export function formatGroupId(id) {
  if (id == null || id === "") {
    return "";
  }
  return `Group #${id}`;
}

export function formatClassId(id) {
  if (id == null || id === "") {
    return "";
  }
  return `Class #${id}`;
}

export function isStructuredGroup(group) {
  return group?.group_type === "structured";
}

export function groupTypeLabel(group) {
  return isStructuredGroup(group) ? "Structured Group" : "Standard Group";
}

export function groupStatusLabel(group) {
  if (!group) {
    return "";
  }
  if (group.status === "archived") {
    return "Archived";
  }
  if (group.readiness && !group.readiness.setup_complete) {
    return "Setup incomplete";
  }
  return "Active";
}

export function setupIncompleteSummary(readiness) {
  if (!readiness || readiness.setup_complete) {
    return "";
  }
  const parts = [];
  if (readiness.missing_class_pin_count) {
    parts.push(
      `${readiness.missing_class_pin_count} Class${readiness.missing_class_pin_count === 1 ? "" : "es"} need a PIN`
    );
  }
  if (
    typeof readiness.launchable_class_count === "number" &&
    readiness.launchable_class_count === 0
  ) {
    parts.push("Add at least one Class with participants before launching the kiosk");
  }
  if (readiness.missing_pin_count) {
    parts.push(
      `${readiness.missing_pin_count} participant${readiness.missing_pin_count === 1 ? "" : "s"} need a PIN`
    );
  }
  if (readiness.missing_email_count) {
    parts.push(
      `${readiness.missing_email_count} participant${readiness.missing_email_count === 1 ? "" : "s"} need an email`
    );
  }
  return parts.join(" · ");
}
