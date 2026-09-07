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
  AD_PLACEMENTS,
  PLACEMENT_DASHBOARD_BANNER,
  PLACEMENT_GROUPS_BANNER,
  PLACEMENT_KIOSK_BUILDER_EXIT,
  PLACEMENT_KIOSK_EXIT,
  PLACEMENT_KIOSK_IDLE,
  PLACEMENT_KIOSK_LAUNCH,
} from "./placements.js";
import {
  isKioskIdleReadyForAd,
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
      placements: [...AD_PLACEMENTS],
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

const businessWorkspace = {
  workspace: {
    entitlements: { features: { ads_required: false }, plan: { key: "business" } },
    advertising: { enabled: false, provider: "mock", placements: [] },
  },
};

const businessTrialWorkspace = {
  workspace: {
    entitlements: { features: { ads_required: false }, plan: { key: "business" } },
    advertising: { enabled: false, provider: "mock", placements: [] },
    builtin_trial: { active: true },
  },
};

test("global advertising OFF bypasses every frozen placement", () => {
  for (const placement of AD_PLACEMENTS) {
    assert.equal(shouldShowPlacement(adsOff, placement), false);
    assert.equal(resolveBannerModel(adsOff, placement, mockProvider), null);
    assert.equal(resolveInterstitialDecision(adsOff, placement, mockProvider).show, false);
  }
});

test("workspaces that do not require ads stay ad-free", () => {
  assert.equal(shouldShowPlacement(plusWorkspace, PLACEMENT_DASHBOARD_BANNER), false);
  assert.equal(shouldShowPlacement(plusWorkspace, PLACEMENT_KIOSK_IDLE), false);
  assert.equal(shouldShowPlacement(businessWorkspace, PLACEMENT_KIOSK_IDLE), false);
  assert.equal(shouldShowPlacement(businessTrialWorkspace, PLACEMENT_KIOSK_IDLE), false);
  assert.equal(
    resolveInterstitialDecision(plusWorkspace, PLACEMENT_KIOSK_LAUNCH, mockProvider).show,
    false,
  );
});

test("Basic idle kiosk placement resolves a mock banner when advertising is enabled", () => {
  assert.equal(shouldShowPlacement(adsOn, PLACEMENT_KIOSK_IDLE), true);
  const model = resolveBannerModel(adsOn, PLACEMENT_KIOSK_IDLE, mockProvider);
  assert.equal(model?.kind, "banner");
  assert.ok(model?.headline);
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
  assert.equal(resolveBannerModel(adsOn, PLACEMENT_KIOSK_IDLE, throwing), null);
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
  assert.equal(resolveBannerModel(adsOn, PLACEMENT_KIOSK_IDLE, empty), null);
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
  assert.match(groupsSrc, /groups-usage[\s\S]*AdBanner session=\{session\} placement=\{PLACEMENT_GROUPS_BANNER\}/);
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

test("kiosk idle banner mounts only through idle-ready helper and AdBanner gate", () => {
  const kioskSrc = readSrc("GroupKioskScreen.jsx");
  assert.match(kioskSrc, /PLACEMENT_KIOSK_IDLE/);
  assert.match(kioskSrc, /isKioskIdleReadyForAd/);
  assert.match(kioskSrc, /AdBanner session=\{session\} placement=\{PLACEMENT_KIOSK_IDLE\}/);
  assert.doesNotMatch(kioskSrc, /workspaceRequiresAds|plan\.key|ads_required/);
  assert.equal((kioskSrc.match(/<AdBanner /g) || []).length, 1);
  assert.doesNotMatch(kioskSrc, /AdInterstitial/);
});

test("active kiosk interaction states hide the idle banner helper", () => {
  assert.equal(isKioskIdleReadyForAd({ step: "start", isStructured: false }), true);
  assert.equal(isKioskIdleReadyForAd({ step: "classes", isStructured: true }), true);
  assert.equal(isKioskIdleReadyForAd({ step: "start", isStructured: true }), false);
  assert.equal(isKioskIdleReadyForAd({ step: "pin", isStructured: false }), false);
  assert.equal(isKioskIdleReadyForAd({ step: "class_pin", isStructured: true }), false);
  assert.equal(isKioskIdleReadyForAd({ step: "confirm", isStructured: false }), false);
  assert.equal(isKioskIdleReadyForAd({ step: "processing", isStructured: false }), false);
  assert.equal(isKioskIdleReadyForAd({ step: "success", isStructured: false }), false);
  assert.equal(isKioskIdleReadyForAd({ step: "start", exitOpen: true }), false);
  assert.equal(isKioskIdleReadyForAd({ step: "start", identifying: true }), false);
  assert.equal(isKioskIdleReadyForAd({ step: "start", performing: true }), false);
  assert.equal(
    isKioskIdleReadyForAd({ step: "start", inputValues: { participant_code: "G1-1234" } }),
    false,
  );
  assert.equal(isKioskIdleReadyForAd({ step: "start", unavailable: true }), false);
});

test("shared live renderer and non-kiosk screens stay free of idle ad mounts", () => {
  assert.doesNotMatch(readSrc("kiosk/KioskRenderer.jsx"), /advertising|AdBanner|AdInterstitial|PLACEMENT_KIOSK_IDLE/);
  assert.doesNotMatch(
    readSrc("kiosk/builder/KioskBuilderPreview.jsx"),
    /advertising|AdBanner|AdInterstitial/,
  );
  assert.doesNotMatch(readSrc("kiosk/KioskSettingsScreen.jsx"), /AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("kiosk/KioskConfirmationScreen.jsx"), /AdBanner|AdInterstitial|advertising/);
  assert.doesNotMatch(readSrc("kiosk/KioskProcessingScreen.jsx"), /AdBanner|AdInterstitial|advertising/);
  assert.doesNotMatch(readSrc("MembersScreen.jsx"), /AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("AccountScreen.jsx"), /AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("StaffManagementScreen.jsx"), /AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("GroupDetailScreen.jsx"), /AdBanner|AdInterstitial/);
  assert.doesNotMatch(readSrc("HistoryScreen.jsx"), /AdBanner|AdInterstitial/);
});
