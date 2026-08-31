function persistedCompletedModuleIds(tutorialState, completedModuleIds) {
  if (Array.isArray(completedModuleIds)) return completedModuleIds;
  return Array.isArray(tutorialState?.completed_module_ids)
    ? tutorialState.completed_module_ids
    : [];
}

export function tutorialModuleStatus(moduleId, tutorialState, completedModuleIds) {
  if (moduleId !== "workspace-overview") {
    return persistedCompletedModuleIds(tutorialState, completedModuleIds).includes(moduleId)
      ? "Completed"
      : "Available";
  }
  if (tutorialState?.status === "completed") return "Completed";
  if (tutorialState?.status === "skipped") return "Skipped";
  if (tutorialState?.status === "in_progress") return "In progress";
  return "Not started";
}

export function tutorialModuleActionLabel(moduleId, tutorialState, completedModuleIds) {
  const status = tutorialModuleStatus(moduleId, tutorialState, completedModuleIds);
  if (status === "In progress") return "Continue";
  if (status === "Completed" || status === "Skipped") {
    return moduleId === "workspace-overview" ? "Restart" : "Replay";
  }
  return "Start";
}
