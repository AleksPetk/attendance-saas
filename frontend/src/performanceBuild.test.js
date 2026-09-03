import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const lazySource = readFileSync(new URL("./lazyScreens.jsx", import.meta.url), "utf8");
const demoVideosSource = readFileSync(
  new URL("./assets/features/third-section/demoVideos.js", import.meta.url),
  "utf8",
);
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("App uses lazy route screens instead of eager screen imports", () => {
  assert.match(appSource, /from "\.\/lazyScreens\.jsx"/);
  assert.match(appSource, /RouteSuspense/);
  assert.doesNotMatch(appSource, /from "\.\/PublicFeaturesScreen\.jsx"/);
  assert.doesNotMatch(appSource, /from "\.\/SignInScreen\.jsx"/);
  assert.doesNotMatch(appSource, /PublicRegisterScreen/);
});

test("lazy screens cover marketing, auth, workspace, and kiosk areas", () => {
  assert.match(lazySource, /lazyScreen\(\(\) => import\("\.\/PublicHomeScreen\.jsx"\)\)/);
  assert.match(lazySource, /lazyScreen\(\(\) => import\("\.\/OwnerLoginScreen\.jsx"\)\)/);
  assert.match(lazySource, /lazyScreen\(\(\) => import\("\.\/DashboardScreen\.jsx"\)\)/);
  assert.match(lazySource, /lazyScreen\(\(\) => import\("\.\/GroupKioskScreen\.jsx"\)\)/);
  assert.match(lazySource, /lazyScreen\(\(\) => import\("\.\/kiosk\/builder\/KioskBuilderScreen\.jsx"\)\)/);
});

test("feature demo videos use static public URLs instead of bundled imports", () => {
  assert.match(demoVideosSource, /FEATURE_MEDIA_BASE = "\/media\/features"/);
  assert.match(demoVideosSource, /ja-configurable-flow-1\.mp4/);
  assert.match(demoVideosSource, /configurable-flow-1\.mp4/);
  assert.doesNotMatch(demoVideosSource, /import .*\.mp4/);
});

test("production HTML does not request Google Fonts", () => {
  assert.doesNotMatch(indexHtml, /fonts\.googleapis\.com/);
  assert.doesNotMatch(indexHtml, /fonts\.gstatic\.com/);
});
