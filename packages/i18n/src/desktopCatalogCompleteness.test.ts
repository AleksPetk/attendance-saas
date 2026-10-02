import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createTranslator } from "./index.js";

const desktopSrcRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../apps/desktop/src",
);

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function collectDesktopTranslationKeys(): string[] {
  const keyRe = /\bt\(\s*["']([a-zA-Z][a-zA-Z0-9_.]*)["']/g;
  const used = new Set<string>();
  for (const file of walkSourceFiles(desktopSrcRoot)) {
    // Strip comments so doc examples like t("participantFallback") are ignored.
    const source = fs.readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    let match: RegExpExecArray | null;
    while ((match = keyRe.exec(source))) {
      used.add(match[1]);
    }
  }
  // Dynamic role labels in DesktopShell.
  used.add("workspace.role.owner");
  used.add("workspace.role.admin");
  used.add("workspace.role.staff");
  return [...used].sort();
}

describe("desktop i18n catalog completeness", () => {
  it("resolves every static desktop t() key in EN and JA", () => {
    const en = createTranslator("en");
    const ja = createTranslator("ja");
    const missingEn: string[] = [];
    const missingJa: string[] = [];
    for (const key of collectDesktopTranslationKeys()) {
      if (en(key) === key) missingEn.push(key);
      if (ja(key) === key) missingJa.push(key);
    }
    assert.deepEqual(missingEn, [], `Missing EN keys:\n${missingEn.join("\n")}`);
    assert.deepEqual(missingJa, [], `Missing JA keys:\n${missingJa.join("\n")}`);
  });

  it("includes the previously broken shell/account keys", () => {
    const en = createTranslator("en");
    const ja = createTranslator("ja");
    assert.equal(en("workspace.subtitle"), "Workspace");
    assert.equal(ja("workspace.subtitle"), "ワークスペース");
    assert.equal(en("workspace.role.owner"), "Owner");
    assert.equal(ja("workspace.role.owner"), "オーナー");
    assert.equal(en("common.signOut"), "Sign out");
    assert.equal(ja("common.signOut"), "サインアウト");
    assert.equal(en("common.changeLanguage"), "Change language");
    assert.equal(ja("common.changeLanguage"), "言語を変更");
    assert.equal(en("security.changePasswordSection"), "Change password");
    assert.equal(ja("security.changePasswordSection"), "パスワードを変更");
  });
});
