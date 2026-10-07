export type ProductTourLayoutKind =
  | "phone-portrait"
  | "phone-landscape"
  | "tablet-portrait"
  | "tablet-landscape";

export type ProductTourSafeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * Phone landscape = landscape + phone-sized short side (+ compact height preference).
 * Compact height keeps very-wide phones from picking up tablet-like vertical chrome.
 */
export function resolveProductTourLayout(width: number, height: number): ProductTourLayoutKind {
  const shortest = Math.min(width, height);
  const landscape = width > height;
  const tablet = shortest >= 600;
  if (tablet) return landscape ? "tablet-landscape" : "tablet-portrait";
  if (landscape && height < 500) return "phone-landscape";
  return landscape ? "phone-landscape" : "phone-portrait";
}

/**
 * Expo / RN can retain portrait safe-area values after an iPhone rotates into landscape
 * (large top + bottom, near-zero left/right). That creates empty top/bottom bands and
 * leaves the side notch unprotected.
 *
 * Portrait and tablet layouts pass insets through unchanged.
 *
 * Phone landscape:
 * - Stale portrait metrics (large top, tiny sides) → move the cutout to BOTH left/right,
 *   zero the top band, and cap the bottom home-indicator inset.
 * - Live landscape metrics → trust left/right (notch on one side), collapse top,
 *   and cap bottom so chrome stays compact.
 */
export function productTourSafeInsetsForLayout(
  layout: ProductTourLayoutKind,
  insets: ProductTourSafeInsets,
): ProductTourSafeInsets {
  if (layout !== "phone-landscape") return insets;

  const stalePortraitCutout =
    insets.top >= 44 && insets.left < 8 && insets.right < 8 ? insets.top : 0;

  if (stalePortraitCutout > 0) {
    return {
      top: 0,
      bottom: Math.min(insets.bottom, 21),
      left: stalePortraitCutout,
      right: stalePortraitCutout,
    };
  }

  return {
    top: Math.min(insets.top, 8),
    bottom: Math.min(Math.max(insets.bottom, 0), 21),
    left: insets.left,
    right: insets.right,
  };
}
