import i18n from "./i18n/index.js";

function t(key, options) {
  return i18n.t(key, { ns: "workspace", ...options });
}

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
      title: t("tutorialSummary.overviewComplete"),
      trialTitle: "",
      trialBody: "",
    };
  }
  if (trial?.active) {
    const end = formatTrialEnd(trial.ends_at);
    return {
      title: t("tutorialSummary.workspaceReady"),
      trialTitle: t("tutorialSummary.trialActiveTitle"),
      trialBody: end
        ? t("tutorialSummary.trialActiveBody", { date: end })
        : t("tutorialSummary.trialActiveBodyOpen"),
    };
  }
  return {
    title: t("tutorialSummary.workspaceReady"),
    trialTitle: t("tutorialSummary.planReadyTitle"),
    trialBody: t("tutorialSummary.planReadyBody"),
  };
}
