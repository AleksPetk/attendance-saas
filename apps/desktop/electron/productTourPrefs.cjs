const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const DEFAULT = { version: 1, seen: false };

function prefsPath() {
  return path.join(app.getPath("userData"), "product-tour.json");
}

function readProductTourPrefs() {
  try {
    const raw = fs.readFileSync(prefsPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      seen: Boolean(parsed?.seen),
      locale: parsed?.locale === "ja" || parsed?.locale === "en" ? parsed.locale : undefined,
    };
  } catch {
    return { ...DEFAULT };
  }
}

function writeProductTourPrefs(next) {
  const current = readProductTourPrefs();
  const merged = {
    version: 1,
    seen: next.seen !== undefined ? Boolean(next.seen) : current.seen,
    locale: next.locale === "ja" || next.locale === "en" ? next.locale : current.locale,
  };
  fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
  fs.writeFileSync(prefsPath(), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}

module.exports = { readProductTourPrefs, writeProductTourPrefs };
