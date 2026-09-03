import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "./components.jsx";
import { usePageTitle } from "./i18n/usePageTitle.js";
import ActivityLogPanel from "./history/ActivityLogPanel.jsx";
import AttendanceReportPanel from "./history/AttendanceReportPanel.jsx";

const VIEWS = [
  { id: "activity", labelKey: "views.activity" },
  { id: "report", labelKey: "views.report" },
];

export default function HistoryScreen({ session }) {
  const { t } = useTranslation("history");
  const location = useLocation();
  const navigate = useNavigate();
  const view = new URLSearchParams(location.search).get("view") === "report" ? "report" : "activity";

  usePageTitle("pageTitles.history");

  function selectView(nextView) {
    navigate(nextView === "report" ? "/history?view=report" : "/history");
  }

  return (
    <div className={`page history-page${view === "activity" ? " history-page-activity" : ""}`}>
      <PageHeader title={t("title")} />

      <div
        className="history-view-switch"
        data-tutorial-target="history-tabs"
        role="tablist"
        aria-label={t("views.ariaLabel")}
      >
        {VIEWS.map((item) => {
          const isActive = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`history-tab-${item.id}`}
              aria-selected={isActive}
              aria-controls={`history-panel-${item.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`history-view-tab${isActive ? " is-active" : ""}`}
              onClick={() => selectView(item.id)}
            >
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>

      {view === "activity" ? (
        <div id="history-panel-activity" role="tabpanel" aria-labelledby="history-tab-activity">
          <ActivityLogPanel session={session} />
        </div>
      ) : null}
      {view === "report" ? (
        <div id="history-panel-report" role="tabpanel" aria-labelledby="history-tab-report">
          <AttendanceReportPanel session={session} />
        </div>
      ) : null}
    </div>
  );
}
