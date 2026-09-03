import i18n from "../i18n/index.js";

/** Development/mock ad copy. No third-party network, IDs, or tracking. */

function adCopy() {
  return {
    kicker: i18n.t("advertising.kicker", { ns: "entitlements" }),
    headline: i18n.t("advertising.headline", { ns: "entitlements" }),
    continueLabel: i18n.t("advertising.continue", { ns: "entitlements" }),
  };
}

export const mockProvider = {
  banner() {
    return {
      kind: "banner",
      ...adCopy(),
    };
  },
  interstitial() {
    return {
      kind: "interstitial",
      ...adCopy(),
    };
  },
};
