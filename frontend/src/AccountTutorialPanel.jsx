import { useTranslation } from "react-i18next";
import { useTutorial } from "./TutorialContext.jsx";
import { tutorialModuleActionLabel, tutorialModuleStatus } from "./tutorialHub.js";

export function TutorialModuleCard({ module, tutorialState, completedModuleIds, onStart }) {
  const status = tutorialModuleStatus(module.id, tutorialState, completedModuleIds);
  return (
    <article className="tutorial-module-card">
      <div className="tutorial-module-card-top">
        <span className="tutorial-module-icon" aria-hidden="true">{module.id === "workspace-overview" ? "◎" : "→"}</span>
        <span className={`tutorial-module-status is-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span>
      </div>
      <h3>{module.title}</h3>
      <p>{module.description}</p>
      <div className="tutorial-module-footer">
        <span>{module.duration}</span>
        <button type="button" className="btn-secondary btn-sm" onClick={() => onStart(module.id)}>
          {tutorialModuleActionLabel(module.id, tutorialState, completedModuleIds)}
        </button>
      </div>
    </article>
  );
}

export default function AccountTutorialPanel() {
  const { t } = useTranslation("workspace");
  const { modules, tutorialState, startTutorial, activeTour, completedModuleIds } = useTutorial();
  return (
    <section className="account-info-panel account-tutorial-panel" aria-labelledby="account-tutorial-title" data-tutorial-target="account-tutorial">
      <header className="account-info-hero">
        <p className="account-info-eyebrow">{t("tutorialHub.panel.eyebrow")}</p>
        <h2 id="account-tutorial-title">{t("tutorialHub.panel.title")}</h2>
        <p>{t("tutorialHub.panel.description")}</p>
      </header>
      <div className="tutorial-module-grid">
        {modules.map((module) => (
          <TutorialModuleCard
            key={module.id}
            module={module}
            tutorialState={tutorialState}
            completedModuleIds={completedModuleIds}
            onStart={(moduleId) => startTutorial(moduleId, {
              automatic: moduleId === "workspace-overview" && tutorialState?.status === "in_progress",
            })}
          />
        ))}
      </div>
      {activeTour ? <p className="hint" role="status">{t("tutorialHub.panel.activeHint")}</p> : null}
    </section>
  );
}
