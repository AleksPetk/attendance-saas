function formatTrialEnd(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function tutorialSummaryCopy(trial, { showTrialAnnouncement = true } = {}) {
  if (!showTrialAnnouncement) {
    return {
      title: "Workspace Overview complete",
      trialTitle: "",
      trialBody: "",
    };
  }
  if (trial?.active) {
    const end = formatTrialEnd(trial.ends_at);
    return {
      title: "Your Workspace is ready",
      trialTitle: "Your 7-day Business trial is active.",
      trialBody: end
        ? `Business access is currently available through ${end}.`
        : "Business access is currently available in this Workspace.",
    };
  }
  return {
    title: "Your Workspace is ready",
    trialTitle: "Your current plan is ready to use.",
    trialBody: "Tutorials never create or change your plan. You can review current access in Account → Subscription.",
  };
}
