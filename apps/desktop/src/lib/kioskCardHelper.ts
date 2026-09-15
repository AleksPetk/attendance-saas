export type KioskHelperStep = "classes" | "class_pin" | "start" | "pin" | "confirm" | "processing" | "success";

/** Mirrors Workspace GroupKioskScreen's card-helper conditions and copy keys. */
export function kioskCardHelperKey({
  mode,
  structured,
  step,
  participantCount,
}: {
  mode: "card" | "input";
  structured: boolean;
  step: KioskHelperStep;
  participantCount: number;
}) {
  if (mode !== "card") return "";
  if (!structured) {
    return step === "start" && participantCount > 0
      ? "kiosk.live.participants.tapCard"
      : "";
  }
  if (step === "classes") return "kiosk.live.classes.choose";
  if (step === "class_pin") return "kiosk.live.classPinHint";
  if (step === "start" && participantCount > 0) return "kiosk.live.participants.chooseStructured";
  if (step === "confirm") return "kiosk.live.chooseAction";
  return "";
}
