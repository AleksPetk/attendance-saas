import { normalizeConfirmationVisualFamily } from "./kioskConfirmation.js";

/** Progressive, action-aware processing copy for live kiosk. */
export function processingHeadline(action, participantName = "") {
  const name = String(participantName || "").trim();
  const suffix = name ? ` ${name}` : "";
  const map = {
    check_in: `Checking in${suffix}…`,
    check_out: `Checking out${suffix}…`,
    break_start: `Starting break${suffix}…`,
    break_end: `Ending break${suffix}…`,
  };
  return map[action] || `Working on it${suffix}…`;
}

export function normalizeProcessingVisualFamily(templateId) {
  return normalizeConfirmationVisualFamily(templateId);
}

export { normalizeConfirmationVisualFamily as normalizeProcessingTemplate };
