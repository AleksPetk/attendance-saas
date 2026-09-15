/** Orientation-driven participant grid for Mobile kiosk editor + live card browse. */
export function kioskPreviewGridColumns(width: number, height: number): 2 | 4 {
  return width > height ? 4 : 2;
}

export type KioskViewportProfile = "phone-portrait" | "phone-landscape" | "tablet";

export type KioskSafeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type PhoneKioskPresentation = {
  headerHeight: number;
  footerHeight: number;
  headerLogoWidth: number;
  headerLogoHeight: number;
  footerLogoWidth: number;
  footerLogoHeight: number;
  headerTitleMax: number;
  mainTitleMax: number;
  footerTextMax: number;
  horizontalPadding: number;
  verticalPadding: number;
  contentGap: number;
};

/** Runtime viewport profile shared by launched kiosk and editor preview. */
export function kioskViewportProfile(width: number, height: number): KioskViewportProfile {
  if (!isPhoneKioskEditor(width, height)) return "tablet";
  return width > height ? "phone-landscape" : "phone-portrait";
}

/**
 * Expo can briefly retain portrait safe-area values after an iPhone rotates.
 * Normalize only phone landscape so that a portrait top inset cannot inflate
 * the Header while the notch sides remain unprotected.
 */
export function kioskSafeInsetsForViewport(
  profile: KioskViewportProfile,
  insets: KioskSafeInsets,
): KioskSafeInsets {
  if (profile !== "phone-landscape") return insets;

  const horizontalCutout = Math.max(insets.left, insets.right, insets.top);
  return {
    top: 0,
    right: Math.max(insets.right, horizontalCutout),
    bottom: Math.min(insets.bottom, 21),
    left: Math.max(insets.left, horizontalCutout),
  };
}

/** Phone-only presentation caps. Saved design values are never modified. */
export function phoneKioskPresentation(profile: KioskViewportProfile, viewportHeight = 390): PhoneKioskPresentation | null {
  if (profile === "tablet") return null;
  if (profile === "phone-landscape") {
    return {
      headerHeight: 48,
      footerHeight: 16,
      headerLogoWidth: 96,
      headerLogoHeight: 48,
      footerLogoWidth: 42,
      footerLogoHeight: 14,
      headerTitleMax: 44,
      mainTitleMax: Math.round(Math.min(24, Math.max(20, viewportHeight * 0.055))),
      footerTextMax: 14,
      horizontalPadding: 14,
      verticalPadding: 0,
      contentGap: 4,
    };
  }
  return {
    headerHeight: 60,
    footerHeight: 42,
    headerLogoWidth: 76,
    headerLogoHeight: 36,
    footerLogoWidth: 58,
    footerLogoHeight: 27,
    headerTitleMax: 25,
    mainTitleMax: 28,
    footerTextMax: 13,
    horizontalPadding: 12,
    verticalPadding: 9,
    contentGap: 10,
  };
}

export type KioskEditorSafeBounds = {
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type KioskEditorPanelMetrics = {
  isPhone: boolean;
  orientation: "portrait" | "landscape";
  width: number;
  maxHeight: number;
};

/** A shortest-side breakpoint keeps every iPad/tablet on the existing editor path. */
export function isPhoneKioskEditor(width: number, height: number): boolean {
  return Math.min(width, height) < 600;
}

export function kioskEditorPanelMetrics(bounds: KioskEditorSafeBounds): KioskEditorPanelMetrics {
  const orientation = bounds.width > bounds.height ? "landscape" : "portrait";
  const isPhone = isPhoneKioskEditor(bounds.width, bounds.height);
  if (!isPhone) {
    return {
      isPhone,
      orientation,
      width: kioskEditorPanelWidth(bounds.width, bounds.left, bounds.right),
      maxHeight: Math.min(bounds.height * 0.68, 730),
    };
  }

  const usableWidth = Math.max(1, bounds.width - bounds.left - bounds.right);
  const usableHeight = Math.max(1, bounds.height - bounds.top - bounds.bottom);
  return {
    isPhone,
    orientation,
    width: Math.min(
      usableWidth - 16,
      usableWidth * (orientation === "portrait" ? 0.9 : 0.48),
    ),
    maxHeight: Math.min(
      usableHeight - 16,
      usableHeight * (orientation === "portrait" ? 0.58 : 0.84),
    ),
  };
}

/** Keep the floating editor fully within the visible safe area. */
export function clampEditorPanelPosition(
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number,
  bounds: KioskEditorSafeBounds,
): { x: number; y: number } {
  const minX = bounds.left + 8;
  const minY = bounds.top + 8;
  const usableHeight = Math.max(panelHeight, 1);
  const maxX = Math.max(minX, bounds.width - bounds.right - panelWidth - 8);
  const maxY = Math.max(minY, bounds.height - bounds.bottom - Math.min(usableHeight, bounds.height - bounds.top - bounds.bottom - 24) - 8);
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

/** Snap phone panels after release; tablets retain the current free-position behavior. */
export function snapPhoneEditorPanelPosition(
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number,
  bounds: KioskEditorSafeBounds,
): { x: number; y: number } {
  const clamped = clampEditorPanelPosition(x, y, panelWidth, panelHeight, bounds);
  if (!isPhoneKioskEditor(bounds.width, bounds.height)) return clamped;

  const minX = bounds.left + 8;
  const minY = bounds.top + 8;
  const maxX = Math.max(minX, bounds.width - bounds.right - panelWidth - 8);
  const maxY = Math.max(
    minY,
    bounds.height - bounds.bottom
      - Math.min(panelHeight, bounds.height - bounds.top - bounds.bottom - 24)
      - 8,
  );

  if (bounds.width > bounds.height) {
    return {
      x: Math.abs(clamped.x - minX) <= Math.abs(clamped.x - maxX) ? minX : maxX,
      y: clamped.y,
    };
  }

  const verticalStops = [minY, minY + (maxY - minY) / 2, maxY];
  const snappedY = verticalStops.reduce((nearest, candidate) =>
    Math.abs(candidate - clamped.y) < Math.abs(nearest - clamped.y) ? candidate : nearest,
  );
  return {
    x: Math.abs(clamped.x - minX) <= Math.abs(clamped.x - maxX) ? minX : maxX,
    y: snappedY,
  };
}

export function preferredKioskEditorPanelPosition(
  metrics: KioskEditorPanelMetrics,
  panelHeight: number,
  bounds: KioskEditorSafeBounds,
): { x: number; y: number } {
  const minX = bounds.left + 8;
  const minY = bounds.top + 8;
  const maxX = Math.max(minX, bounds.width - bounds.right - metrics.width - 8);
  const maxY = Math.max(
    minY,
    bounds.height - bounds.bottom
      - Math.min(panelHeight, bounds.height - bounds.top - bounds.bottom - 24)
      - 8,
  );
  if (!metrics.isPhone) return { x: Math.max(minX, maxX - 8), y: minY + 8 };
  if (metrics.orientation === "landscape") return { x: maxX, y: minY };
  return { x: minX + (maxX - minX) / 2, y: maxY };
}

/** Suggested floating editor width — compact like Desktop, touch-friendly. */
export function kioskEditorPanelWidth(viewportWidth: number, leftInset: number, rightInset: number): number {
  const available = viewportWidth - leftInset - rightInset - 24;
  return Math.min(360, Math.max(280, available));
}
