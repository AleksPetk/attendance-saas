/** Development/mock ad copy. No third-party network, IDs, or tracking. */

const BANNER = {
  kind: "banner",
  kicker: "ADVERTISEMENT",
  headline: "Development placeholder",
};

const INTERSTITIAL = {
  kind: "interstitial",
  kicker: "ADVERTISEMENT",
  headline: "Development placeholder",
  continueLabel: "Continue",
};

export const mockProvider = {
  banner() {
    return { ...BANNER };
  },
  interstitial() {
    return { ...INTERSTITIAL };
  },
};
