/**
 * Run: node --test src/advertising/*.test.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { mockProvider } from "./mockProvider.js";
import {
  PLACEMENT_DASHBOARD_BANNER,
  PLACEMENT_GROUPS_BANNER,
  PLACEMENT_KIOSK_BUILDER_EXIT,
  PLACEMENT_KIOSK_EXIT,
  PLACEMENT_KIOSK_LAUNCH,
} from "./placements.js";
import {
  resolveBannerModel,
  resolveInterstitialDecision,
  shouldShowPlacement,
} from "./state.js";

const root = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(root, "..");

function readSrc(relativePath) {
  return readFileSync(join(srcRoot, relativePath), "utf8");
}

const adsOn = {
  workspace: {
    advertising: {
      enabled: true,
      provider: "mock",
      placements: [
        PLACEMENT_DASHBOARD_BANNER,
        PLACEMENT_GROUPS_BANNER,
        PLACEMENT_KIOSK_LAUNCH,
        PLACEMENT_KIOSK_EXIT,
        PLACEMENT_KIOSK_BUILDER_EXIT,
      ],
    },
  },
};

const adsOff = {
  workspace: {
    advertising: { enabled: false, provider: "mock", placements: [] },
  },
};

const plusWorkspace = {
  workspace: {
    entitlements: { features: { ads_required: false } },
    advertising: { enabled: false, provider: "mock", placements: [] },
  },
};

test("global advertising OFF bypasses every frozen placement", () => {
  for (const placement of [
    PLACEMENT_DASHBOARD_BANNER,
    PLACEMENT_GROUPS_BANNER,
    PLACEMENT_KIOSK_LAUNCH,
    PLACEMENT_KIOSK_EXIT,
    PLACEMENT_KIOSK_BUILDER_EXIT,
  ]) {
    assert.equal(shouldShowPlacement(adsOff, placement), false);
    assert.equal(resolveBannerModel(adsOff, placement, mockProvider), null);
    assert.equal(resolveInterstitialDecision(adsOff, placement, mockProvider).show, false);
  }
});

test("workspaces that do not require ads stay ad-free", () => {
  assert.equal(shouldShowPlacement(plusWorkspace, PLACEMENT_DASHBOARD_BANNER), false);
  assert.equal(
    resolveInterstitialDecision(plusWorkspace, PLACEMENT_KIOSK_LAUNCH, mockProvider).show,
    false,
  );
});

test("provider failure fails open for banners and interstitials", () => {
  const throwing = {
    banner() {
      throw new Error("provider down");
    },
    interstitial() {
      throw new Error("provider down");
    },
  };
  assert.equal(resolveBannerModel(adsOn, PLACEMENT_DASHBOARD_BANNER, throwing), null);
  assert.equal(resolveBannerModel(adsOn, PLACEMENT_GROUPS_BANNER, throwing), null);
  assert.equal(
    resolveInterstitialDecision(adsOn, PLACEMENT_KIOSK_LAUNCH, throwing).show,
    false,
  );
  assert.equal(
    resolveInterstitialDecision(adsOn, PLACEMENT_KIOSK_EXIT, throwing).show,
    false,
  );
  assert.equal(
    resolveInterstitialDecision(adsOn, PLACEMENT_KIOSK_BUILDER_EXIT, throwing).show,
    false,
  );
});

test("empty provider content fails open", () => {
  const empty = { banner: () => null, interstitial: () => null };
  assert.equal(resolveBannerModel(adsOn, PLACEMENT_DASHBOARD_BANNER, empty), null);
  assert.equal(
    resolveInterstitialDecision(adsOn, PLACEMENT_KIOSK_LAUNCH, empty).show,
    false,
  );
});

test("Dashboard banner is the only dashboard placement", () => {
  const dashboardSrc = readSrc("DashboardScreen.jsx");
  assert.match(dashboardSrc, /PLACEMENT_DASHBOARD_BANNER/);
  assert.match(dashboardSrc, /<AdBanner session=\{session\} placement=\{PLACEMENT_DASHBOARD_BANNER\} \/>/);
  assert.equal((dashboardSrc.match(/<AdBanner /g) || []).length, 1);
});

test("Groups banner sits above the card grid and not in PlanLockSelectionPanel", () => {
  const groupsSrc = readSrc("GroupsScreen.jsx");
  assert.match(groupsSrc, /PLACEMENT_GROUPS_BANNER/);
  assert.match(groupsSrc, /plan-usage-hint[\s\S]*AdBanner session=\{session\} placement=\{PLACEMENT_GROUPS_BANNER\}/);
  const selectionBlock = groupsSrc.slice(
    groupsSrc.indexOf("if (selectionOpen && mustSelect)"),
    groupsSrc.indexOf("return (", groupsSrc.indexOf("if (selectionOpen && mustSelect)") + 1),
  );
  assert.doesNotMatch(selectionBlock, /AdBanner/);
});

test("kiosk launch interstitial is requested before /kiosk navigation", () => {
  const appSrc = readSrc("App.jsx");
  assert.match(appSrc, /if \(!confirmWorkspaceLeave\(\)\) return;/);
  const launchBlock = appSrc.slice(
    appSrc.indexOf('if (route.name === "kiosk")'),
    appSrc.indexOf("if (leavingBuilder"),
  );
  assert.match(launchBlock, /PLACEMENT_KIOSK_LAUNCH/);
  assert.match(launchBlock, /requestInterstitial/);
  assert.match(launchBlock, /applyWorkspaceRoute\(route\)/);
});

test("kiosk exit interstitial runs after unlock guard and lock clear", () => {
  const appSrc = readSrc("App.jsx");
  const exitBlock = appSrc.slice(
    appSrc.indexOf("function onKioskUnlocked"),
    appSrc.indexOf("if (location.pathname.startsWith(\"/kiosk/\")"),
  );
  assert.match(exitBlock, /beginKioskExitGuard\(\)/);
  assert.match(exitBlock, /onKioskUnlockedLocally\(lockPayload\)/);
  const guardAt = exitBlock.indexOf("beginKioskExitGuard");
  const clearAt = exitBlock.indexOf("onKioskUnlockedLocally");
  const adAt = exitBlock.indexOf("PLACEMENT_KIOSK_EXIT");
  assert.ok(guardAt < clearAt);
  assert.ok(clearAt < adAt);
  assert.match(exitBlock, /requestInterstitial\(PLACEMENT_KIOSK_EXIT/);
});

test("builder exit interstitial runs only after dirty-state resolution", () => {
  const appSrc = readSrc("App.jsx");
  const navBlock = appSrc.slice(
    appSrc.indexOf("function onNavigate(route)"),
    appSrc.indexOf("function onKioskUnlocked"),
  );
  assert.match(navBlock, /if \(!confirmWorkspaceLeave\(\)\) return;/);
  const confirmAt = navBlock.indexOf("confirmWorkspaceLeave");
  const builderAt = navBlock.indexOf("leavingBuilder");
  const adAt = navBlock.indexOf("PLACEMENT_KIOSK_BUILDER_EXIT");
  assert.ok(confirmAt < builderAt);
  assert.ok(builderAt < adAt);
  assert.match(navBlock, /leavingBuilder && !stayingInBuilder/);
});

test("live kiosk and shared renderer stay ad-free", () => {
  assert.doesNotMatch(readSrc("GroupKioskScreen.jsx"), /advertising|AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("kiosk/KioskRenderer.jsx"), /advertising|AdBanner|AdInterstitial/);
  assert.doesNotMatch(
    readSrc("kiosk/builder/KioskBuilderPreview.jsx"),
    /advertising|AdBanner|AdInterstitial/,
  );
  assert.doesNotMatch(readSrc("kiosk/KioskSettingsScreen.jsx"), /AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("MembersScreen.jsx"), /AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("AccountScreen.jsx"), /AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("StaffManagementScreen.jsx"), /AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("GroupDetailScreen.jsx"), /AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("HistoryScreen.jsx"), /AdBanner|AdInterstitial/);
});
