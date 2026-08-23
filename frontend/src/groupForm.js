export function formatGroupId(id) {
  if (id == null || id === "") {
    return "";
  }
  return `Group #${id}`;
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
