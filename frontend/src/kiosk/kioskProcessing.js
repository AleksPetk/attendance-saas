import i18n from "../i18n/index.js";
import { normalizeConfirmationVisualFamily } from "./kioskConfirmation.js";

/** Progressive, action-aware processing copy for live kiosk. */
export function processingHeadline(action, participantName = "") {
  const name = String(participantName || "").trim();
  const nameSuffix = name ? i18n.t("kiosk:processing.nameSuffix", { name }) : "";
  const map = {
    check_in: "processing.checkingIn",
    check_out: "processing.checkingOut",
    break_start: "processing.startingBreak",
    break_end: "processing.endingBreak",
  };
  const key = map[action] || "processing.working";
  return i18n.t(`kiosk:${key}`, { name: nameSuffix });
}

export function normalizeProcessingVisualFamily(templateId) {
  return normalizeConfirmationVisualFamily(templateId);
}

export { normalizeConfirmationVisualFamily as normalizeProcessingTemplate };
