import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("mobile root installs the real safe-area provider", () => {
  const layout = read("apps/mobile/app/_layout.tsx");
  assert.match(layout, /SafeAreaProvider/);
  assert.match(layout, /initialWindowMetrics/);
  assert.equal(/paddingTop:\s*(40|59|60)/.test(layout), false);
});

test("headerless tab scenes and legal modal use device insets, not fake status-bar padding", () => {
  const tabs = read("apps/mobile/app/(app)/(tabs)/_layout.tsx");
  const legal = read("apps/mobile/src/components/LegalDocumentModal.tsx");
  const auth = read("apps/mobile/src/components/AuthScreen.tsx");
  assert.match(tabs, /useSafeAreaInsets/);
  assert.match(tabs, /paddingTop: insets\.top/);
  assert.match(tabs, /tabBarPosition: "bottom"/);
  assert.equal(tabs.includes("TabletRail"), false);
  assert.equal(tabs.includes('tabBarPosition: "left"'), false);
  assert.equal(/width\s*>=\s*768/.test(tabs), false);
  assert.equal(tabs.includes("paddingBottom: 22"), false);
  assert.equal(tabs.includes("paddingTop: 28"), false);
  assert.match(legal, /FullScreenSafeArea/);
  assert.match(legal, /topComfortGap/);
  assert.match(read("apps/mobile/src/components/safeArea.tsx"), /paddingTop: insets\.top/);
  assert.match(auth, /SafeAreaView/);
  assert.equal(auth.includes("paddingTop: 40"), false);
});
