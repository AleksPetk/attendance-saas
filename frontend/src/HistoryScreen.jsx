import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "./components.jsx";
import ActivityLogPanel from "./history/ActivityLogPanel.jsx";
import AttendanceReportPanel from "./history/AttendanceReportPanel.jsx";

const VIEWS = [
  { id: "activity", label: "Activity Log" },
  { id: "report", label: "Attendance Report" },
];

export default function HistoryScreen({ session }) {
  const location = useLocation();
  const navigate = useNavigate();
  const view = new URLSearchParams(location.search).get("view") === "report" ? "report" : "activity";

  function selectView(nextView) {
    navigate(nextView === "report" ? "/history?view=report" : "/history");
  }

  return (
    <div className="page">
      <PageHeader
        title="History"
        description="Review recent activity or build focused Member and Group attendance reports."
      />

      <div className="history-view-switch" data-tutorial-target="history-tabs" role="tablist" aria-label="History views">
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
              {item.label}
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
