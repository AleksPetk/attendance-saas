import {
  FOOTER_HEIGHT_MAX,
  FOOTER_HEIGHT_MIN,
  HEADER_HEIGHT_MAX,
  HEADER_HEIGHT_MIN,
  MAIN_MIN_FRACTION,
} from "../kioskVisual.js";

export {
  FOOTER_HEIGHT_MAX,
  FOOTER_HEIGHT_MIN,
  HEADER_HEIGHT_MAX,
  HEADER_HEIGHT_MIN,
  MAIN_MIN_FRACTION,
};

export const HISTORY_LIMIT = 60;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const FILE_SESSION_CAP = 8;

export const COLOR_SWATCHES = [
  "#FFFFFF",
  "#F8FAFC",
  "#E2E8F0",
  "#94A3B8",
  "#1E293B",
  "#0F172A",
  "#000000",
  "#2563EB",
  "#3B82F6",
  "#22C55E",
  "#16A34A",
  "#F59E0B",
  "#EF4444",
  "#A855F7",
];

export function cloneConfig(config) {
  if (config == null || typeof config !== "object") {
    throw new Error("Kiosk design config is missing.");
  }
  return JSON.parse(JSON.stringify(config));
}

export function configsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function patchConfig(config, path, value) {
  const next = cloneConfig(config);
  const parts = path.split(".");
  let cursor = next;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (cursor[key] == null || typeof cursor[key] !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
  return next;
}

export function normalizeHex(raw) {
  const value = String(raw || "").trim();
  const short = /^#?[0-9a-fA-F]{3}$/;
  const long = /^#?[0-9a-fA-F]{6}$/;
  if (short.test(value)) {
    const hex = value.replace("#", "");
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase();
  }
  if (long.test(value)) {
    return `#${value.replace("#", "")}`.toUpperCase();
  }
  return null;
}

export const HEX_COLOR_ERROR = "Enter a hex color like #3B82F6.";

export function evaluateHexDraft(raw) {
  const draft = String(raw ?? "");
  const color = normalizeHex(draft);
  return {
    draft,
    color,
    error: color ? "" : HEX_COLOR_ERROR,
  };
}

export function replaceHexDraftSelection(raw, clipboardText, selectionStart, selectionEnd) {
  const current = String(raw ?? "");
  const pasted = String(clipboardText ?? "").trim();
  const start = Number.isInteger(selectionStart) ? selectionStart : current.length;
  const end = Number.isInteger(selectionEnd) ? selectionEnd : start;
  const draft = `${current.slice(0, start)}${pasted}${current.slice(end)}`;
  return {
    draft,
    caret: start + pasted.length,
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clampHeaderHeight(height, footerEnabled, footerHeight) {
  const footer = footerEnabled ? Number(footerHeight) || 0 : 0;
  const max = Math.min(HEADER_HEIGHT_MAX, 1 - MAIN_MIN_FRACTION - footer);
  return clamp(Number(height) || HEADER_HEIGHT_MIN, HEADER_HEIGHT_MIN, Math.max(HEADER_HEIGHT_MIN, max));
}

export function clampFooterHeight(height, headerEnabled, headerHeight) {
  const header = headerEnabled ? Number(headerHeight) || 0 : 0;
  const max = Math.min(FOOTER_HEIGHT_MAX, 1 - MAIN_MIN_FRACTION - header);
  return clamp(Number(height) || FOOTER_HEIGHT_MIN, FOOTER_HEIGHT_MIN, Math.max(FOOTER_HEIGHT_MIN, max));
}

export function isAllowedImageFile(file) {
  if (!file) return { ok: false, error: "Choose an image file." };
  const types = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!types.includes(file.type)) {
    return { ok: false, error: "Use a JPEG, PNG, GIF, or WebP image." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image must be under 10 MB." };
  }
  return { ok: true };
}

export function ensureHeaderLogo(config) {
  const next = cloneConfig(config);
  if (!next.header.logo) {
    next.header.logo = { size: 0.75 };
  } else if (next.header.logo.size == null) {
    const height = Number(next.header.logo.height);
    const width = Number(next.header.logo.width);
    let size = 0.75;
    if (Number.isFinite(height)) size = height;
    else if (Number.isFinite(width)) size = Math.min(1, width * 2.5);
    next.header.logo = { size: Math.min(1, Math.max(0.35, size)) };
  } else {
    next.header.logo = { size: Number(next.header.logo.size) || 0.75 };
  }
  return next;
}

/** Normalize Header/Footer logo placement for editor rehydration (no media URLs). */
export function normalizeDesignMediaConfig(config) {
  let next = cloneConfig(config);
  next.header = { ...(next.header || {}), enabled: true };
  next.footer = { ...(next.footer || {}), enabled: true };
  if (next.header.logo) {
    next = ensureHeaderLogo(next);
  }
  if (next.footer?.logo && typeof next.footer.logo === "object") {
    const alignment = ["left", "center", "right"].includes(next.footer.logo.alignment)
      ? next.footer.logo.alignment
      : "left";
    const raw = Number(next.footer.logo.size);
    const size = Number.isFinite(raw) ? Math.min(1, Math.max(0.35, raw)) : 0.75;
    next.footer.logo = { alignment, size };
  }
  return next;
}

export function formatApiError(error) {
  const data = error?.data;
  if (!data) return "Save failed. Try again.";
  if (typeof data === "string") return data;
  if (typeof data.detail === "string") return data.detail;
  const parts = [];
  function walk(value, prefix) {
    if (Array.isArray(value)) {
      parts.push(prefix ? `${prefix}: ${value.join(" ")}` : value.join(" "));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, nested]) => {
        walk(nested, prefix ? `${prefix}.${key}` : key);
      });
      return;
    }
    if (value != null && value !== "") {
      parts.push(prefix ? `${prefix}: ${value}` : String(value));
    }
  }
  walk(data, "");
  return parts.slice(0, 5).join(" · ") || "Save failed. Try again.";
}

export function validateWorkingConfig(config) {
  const errors = [];
  const title = config?.header?.title?.text || "";
  if (title.length > 150) errors.push("Header title is too long.");
  const lines = config?.footer?.text?.lines || [];
  if (lines.length > 1) errors.push("Footer supports at most one line of text.");
  lines.forEach((line, index) => {
    if (typeof line !== "string") {
      errors.push(`Footer line ${index + 1} must be text.`);
      return;
    }
    if (/\r|\n/.test(line)) errors.push("Footer text must be a single line.");
    if (line.length > 200) errors.push(`Footer line ${index + 1} is too long.`);
  });
  const mainTitle = config?.main?.title?.text || "";
  if (mainTitle.length > 150) errors.push("Main title is too long.");
  return errors;
}
