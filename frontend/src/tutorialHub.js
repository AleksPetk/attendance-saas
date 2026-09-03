import i18n from "./i18n/index.js";

function t(key, options) {
  return i18n.t(key, { ns: "workspace", ...options });
}

function persistedCompletedModuleIds(tutorialState, completedModuleIds) {
  if (Array.isArray(completedModuleIds)) return completedModuleIds;
  return Array.isArray(tutorialState?.completed_module_ids)
    ? tutorialState.completed_module_ids
    : [];
}

export function tutorialModuleStatusKey(moduleId, tutorialState, completedModuleIds) {
  if (moduleId !== "workspace-overview") {
    return persistedCompletedModuleIds(tutorialState, completedModuleIds).includes(moduleId)
      ? "completed"
      : "available";
  }
  if (tutorialState?.status === "completed") return "completed";
  if (tutorialState?.status === "skipped") return "skipped";
  if (tutorialState?.status === "in_progress") return "inProgress";
  return "notStarted";
}

export function tutorialModuleStatus(moduleId, tutorialState, completedModuleIds) {
  const key = tutorialModuleStatusKey(moduleId, tutorialState, completedModuleIds);
  return t(`tutorialHub.status.${key}`);
}

export function tutorialModuleActionLabel(moduleId, tutorialState, completedModuleIds) {
  const statusKey = tutorialModuleStatusKey(moduleId, tutorialState, completedModuleIds);
  if (statusKey === "inProgress") return t("tutorialHub.actions.continue");
  if (statusKey === "completed" || statusKey === "skipped") {
    return moduleId === "workspace-overview"
      ? t("tutorialHub.actions.restart")
      : t("tutorialHub.actions.replay");
  }
  return t("tutorialHub.actions.start");
}
