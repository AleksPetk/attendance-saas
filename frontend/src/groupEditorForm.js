/**
 * Normalized Group configuration draft/baseline comparison for the Group editor.
 * Email Sender state is intentionally excluded — it has its own save flow.
 */

export function cloneGroupConfig(source) {
  return JSON.parse(JSON.stringify(source || {}));
}

export function normalizeGroupConfig(values) {
  const body = cloneGroupConfig(values);
  if (!body.actions) {
    body.actions = {};
  }
  if (!body.participation) {
    body.participation = {};
  }
  if (!body.notifications) {
    body.notifications = {};
  }

  body.name = (body.name || "").trim();
  body.group_type = body.group_type === "structured" ? "structured" : "standard";

  body.actions.check_in_enabled = Boolean(body.actions.check_in_enabled);
  body.actions.check_out_enabled = Boolean(body.actions.check_out_enabled);
  body.actions.breaks_enabled = Boolean(body.actions.breaks_enabled);

  if (!body.actions.breaks_enabled) {
    delete body.actions.max_breaks;
  } else {
    body.actions.max_breaks = Number(body.actions.max_breaks) || 1;
  }

  body.participation.email_required = Boolean(body.participation.email_required);
  body.participation.pin_required = Boolean(body.participation.pin_required);

  if (body.group_type === "structured") {
    body.require_class_pin = Boolean(body.require_class_pin);
  } else {
    delete body.require_class_pin;
  }

  if (!body.actions.check_in_enabled) {
    delete body.notifications.check_in;
  }
  if (!body.actions.check_out_enabled) {
    delete body.notifications.check_out;
  }
  if (!body.actions.breaks_enabled) {
    delete body.notifications.break;
  }

  return body;
}

export function isGroupConfigDirty(values, savedBaseline) {
  return (
    JSON.stringify(normalizeGroupConfig(values)) !==
    JSON.stringify(normalizeGroupConfig(savedBaseline))
  );
}

export function groupConfigFromApi(group, emptyGroup) {
  return {
    name: group.name || "",
    group_type: group.group_type === "structured" ? "structured" : "standard",
    require_class_pin: Boolean(group.require_class_pin),
    actions: { ...emptyGroup.actions, ...(group.actions || {}) },
    participation: { ...emptyGroup.participation, ...(group.participation || {}) },
    notifications: {
      check_in: {
        ...emptyGroup.notifications.check_in,
        ...(group.notifications?.check_in || {}),
      },
      check_out: {
        ...emptyGroup.notifications.check_out,
        ...(group.notifications?.check_out || {}),
      },
      break: {
        ...emptyGroup.notifications.break,
        ...(group.notifications?.break || {}),
      },
    },
  };
}
