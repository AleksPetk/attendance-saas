export function advanceTutorialFlow(tour) {
  if (!tour || tour.summary) return tour;
  if (tour.index < tour.steps.length - 1) return { ...tour, index: tour.index + 1 };
  const workspaceOverview = tour.module?.id === "workspace-overview";
  if (!workspaceOverview) {
    return {
      ...tour,
      finished: true,
      completionMode: "lightweight",
      terminalStatus: "completed",
    };
  }
  return {
    ...tour,
    summary: true,
    completionMode: "summary",
    showTrialAnnouncement: Boolean(tour.automatic),
    terminalStatus: tour.automatic ? "completed" : "replayed",
  };
}

export function skipTutorialFlow(tour) {
  if (!tour?.automatic) return tour;
  return {
    ...tour,
    summary: true,
    completionMode: "summary",
    showTrialAnnouncement: true,
    terminalStatus: "skipped",
  };
}

export function focusedTutorialReturnRoute(tour) {
  if (!tour || tour.automatic || tour.module?.id === "workspace-overview") return null;
  return "/account/tutorial";
}
