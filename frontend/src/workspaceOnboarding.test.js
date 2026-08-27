/**
 * Run: node --test src/workspaceOnboarding.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { onboardingStorageKey, shouldShowWorkspaceOnboarding } from "./workspaceOnboarding.js";

describe("workspace onboarding visibility", () => {
  it("is owner-only and requires an active built-in trial", () => {
    assert.equal(
      shouldShowWorkspaceOnboarding({
        workspace: {
          account_kind: "workspace_staff",
          workspace_id: "ABC123",
          builtin_trial: { active: true },
        },
      }),
      false,
    );
    assert.equal(
      shouldShowWorkspaceOnboarding({
        workspace: {
          account_kind: "owner",
          workspace_id: "ABC123",
          builtin_trial: { active: false },
        },
      }),
      false,
    );
  });

  it("uses a workspace-scoped storage key", () => {
    assert.equal(onboardingStorageKey("ABC123"), "checkstation-workspace-onboarding:ABC123");
  });
});
