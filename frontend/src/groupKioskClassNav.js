/**
 * Structured live-kiosk Class navigation helpers (pure; unit-tested).
 */

export function resolveClassSectionId(section) {
  if (!section || typeof section !== "object") {
    return null;
  }
  if (section.id != null && section.id !== "") {
    return section.id;
  }
  if (section.section_id != null && section.section_id !== "") {
    return section.section_id;
  }
  return null;
}

export function classPinGateRequired(kioskRequireClassPin, section) {
  return Boolean(kioskRequireClassPin || section?.requires_class_pin);
}

export function classPeoplePath(groupId, sectionId) {
  return `/api/groups/${groupId}/kiosk/classes/${sectionId}/people/`;
}

export function classVerifyPinPath(groupId, sectionId) {
  return `/api/groups/${groupId}/kiosk/classes/${sectionId}/verify-pin/`;
}
