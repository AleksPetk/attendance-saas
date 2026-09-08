import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createTranslator } from "@checkstation/i18n";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function sources(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? sources(join(path, entry.name)) : /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [join(path, entry.name)] : []);
}
test("every literal mobile translation resolves in EN and JA", () => {
  const missing = new Set<string>();
  for (const file of [...sources(join(mobile, "app")), ...sources(join(mobile, "src"))]) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
      const key = match[1];
      // Dynamic prefixes are checked through their finite UI option catalogs separately.
      if (key.endsWith(".")) continue;
      for (const locale of ["en", "ja"] as const) if (createTranslator(locale)(key) === key) missing.add(locale + ": " + key);
    }
  }
  assert.deepEqual([...missing].sort(), []);
});
