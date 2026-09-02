import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import i18n from "./index.js";
import { availableTutorialModules } from "../workspaceOnboarding.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

function loadWorkspaceLocale(language) {
  return JSON.parse(readFileSync(join(ROOT, "locales", language, "workspace.json"), "utf8"));
}

function flatten(value, prefix = "") {
  return Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return item && typeof item === "object" && !Array.isArray(item)
      ? flatten(item, path)
      : [[path, item]];
  });
}

function ownerSession() {
  return {
    workspace: {
      account_kind: "owner",
      capabilities: {
        can_manage_workspace: true,
        can_manage_staff_accounts: true,
        can_manage_owner_account: true,
        can_view_global_members: true,
        can_view_billing: true,
        can_manage_subscription: true,
        can_launch_kiosk: true,
      },
      entitlements: {
        features: {
          structured_groups: true,
          staff_management: true,
          group_forward_emails: true,
          report_export_csv: true,
          report_export_pdf: true,
        },
        limits: {
          active_standard_groups: 10,
          active_structured_groups: 5,
          archived_groups: 10,
        },
      },
    },
  };
}

describe("Workspace tutorial localization", () => {
  it("keeps every English and Japanese tutorial key in parity", () => {
    const enKeys = flatten(loadWorkspaceLocale("en").tutorial).map(([key]) => key).sort();
    const jaKeys = flatten(loadWorkspaceLocale("ja").tutorial).map(([key]) => key).sort();
    assert.deepEqual(jaKeys, enKeys);
  });

  it("provides Japanese copy for every direct tutorial step description", () => {
    const enSteps = loadWorkspaceLocale("en").tutorial.steps;
    const jaSteps = loadWorkspaceLocale("ja").tutorial.steps;
    const descriptionIds = Object.keys(enSteps).filter((id) => "description" in enSteps[id]);

    assert.equal(descriptionIds.length, 80);
    for (const id of descriptionIds) {
      assert.notEqual(jaSteps[id].description, enSteps[id].description, id);
      assert.match(jaSteps[id].description, /[\u3040-\u30ff\u3400-\u9fff]/u, id);
    }
    assert.doesNotMatch(
      jaSteps["overview-dashboard"].description,
      /Dashboard shows Member and Group totals alongside recent attendance activity/,
    );
  });

  it("resolves all available step titles and descriptions in Japanese without English fallback", async () => {
    const session = ownerSession();
    try {
      await i18n.changeLanguage("en");
      const english = new Map(
        availableTutorialModules(session, { groupId: 42 })
          .flatMap((module) => module.steps)
          .map((step) => [step.id, { title: step.title, description: step.description }]),
      );

      await i18n.changeLanguage("ja");
      const japanese = availableTutorialModules(session, { groupId: 42 }).flatMap((module) => module.steps);
      assert.equal(new Set(japanese.map((step) => step.id)).size, 86);

      for (const step of japanese) {
        const source = english.get(step.id);
        assert.ok(step.title, `${step.id} title`);
        assert.ok(step.description, `${step.id} description`);
        assert.notEqual(step.title, source.title, `${step.id} title`);
        assert.notEqual(step.description, source.description, `${step.id} description`);
        assert.match(`${step.title}${step.description}`, /[\u3040-\u30ff\u3400-\u9fff]/u, step.id);
      }

      const overview = japanese.find((step) => step.id === "overview-dashboard");
      const groupCapacity = japanese.find((step) => step.id === "groups-capacity");
      const kioskConfirmation = japanese.find((step) => step.id === "kiosk-settings-confirmation");
      assert.equal(overview.title, "ワークスペースの概要");
      assert.match(groupCapacity.description, /現在の Basic プラン/);
      assert.match(kioskConfirmation.description, /確認画面/);
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
