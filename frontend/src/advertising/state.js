import { AD_PLACEMENTS } from "./placements.js";

export function advertisingFromSession(session) {
  return session?.workspace?.advertising || null;
}

/**
 * Live kiosk idle/ready only (Standard start or Structured class picker).
 * Hides during identify/confirm/processing/success and operator exit dialog.
 */
export function isKioskIdleReadyForAd({
  step,
  unavailable = false,
  isStructured = false,
  exitOpen = false,
  identifying = false,
  performing = false,
  inputValues = null,
} = {}) {
  try {
    if (unavailable || exitOpen || identifying || performing) return false;
    if (step === "processing" || step === "success" || step === "confirm") return false;
    if (step === "pin" || step === "class_pin") return false;
    if (inputValues && typeof inputValues === "object") {
      const draftActive = Object.values(inputValues).some(
        (value) => String(value ?? "").trim() !== "",
      );
      if (draftActive) return false;
    }
    if (isStructured) return step === "classes";
    return step === "start";
  } catch {
    return false;
  }
}

/** Backend-authoritative: workspace requires ads AND platform switch is on. */
export function advertisingIsEnabled(session) {
  return Boolean(advertisingFromSession(session)?.enabled);
}

export function advertisingProvider(session) {
  return advertisingFromSession(session)?.provider || null;
}

export function advertisingPlacements(session) {
  const placements = advertisingFromSession(session)?.placements;
  return Array.isArray(placements) ? placements : [];
}

export function shouldShowPlacement(session, placementId) {
  try {
    if (!placementId || !advertisingIsEnabled(session)) return false;
    const allowed = advertisingPlacements(session);
    if (allowed.length) return allowed.includes(placementId);
    return AD_PLACEMENTS.includes(placementId);
  } catch {
    return false;
  }
}

/**
 * Fail-open interstitial decision. Never throws to the caller.
 * show:false means continue the original navigation immediately.
 */
export function resolveInterstitialDecision(session, placementId, provider) {
  try {
    if (!shouldShowPlacement(session, placementId)) {
      return { show: false, model: null };
    }
    const model = provider?.interstitial?.(placementId);
    if (!model) return { show: false, model: null };
    return { show: true, model };
  } catch {
    return { show: false, model: null };
  }
}

export function resolveBannerModel(session, placementId, provider) {
  try {
    if (!shouldShowPlacement(session, placementId)) return null;
    const model = provider?.banner?.(placementId);
    return model || null;
  } catch {
    return null;
  }
}
