/**
 * Helpers for Standard vs Structured live kiosk start payload mapping.
 * Keep Class-scoped people loading separate from Standard Card people.
 */

export function peopleFromKioskStartPayload(data) {
  if (data?.kiosk?.structured) {
    return [];
  }
  return Array.isArray(data?.people) ? data.people : [];
}

export function initialKioskStepFromStartPayload(data) {
  return data?.kiosk?.structured ? "classes" : "start";
}
