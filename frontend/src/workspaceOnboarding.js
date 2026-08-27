import { isWorkspaceOwner } from "./workspaceSession.js";

const STORAGE_PREFIX = "checkstation-workspace-onboarding:";

export function onboardingStorageKey(workspaceId) {
  return `${STORAGE_PREFIX}${workspaceId || "unknown"}`;
}

export function shouldShowWorkspaceOnboarding(session) {
  if (!isWorkspaceOwner(session)) return false;
  const trial = session?.workspace?.builtin_trial;
  if (!trial?.active) return false;
  const workspaceId = session?.workspace?.workspace_id;
  if (!workspaceId) return false;
  try {
    return window.localStorage.getItem(onboardingStorageKey(workspaceId)) !== "done";
  } catch {
    return true;
  }
}

export function markWorkspaceOnboardingDone(workspaceId) {
  try {
    window.localStorage.setItem(onboardingStorageKey(workspaceId), "done");
  } catch {
    /* ignore quota / private mode */
  }
}
