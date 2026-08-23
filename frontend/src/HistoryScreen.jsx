import { useState } from "react";
import { PageHeader } from "./components.jsx";
import ActivityLogPanel from "./history/ActivityLogPanel.jsx";
import AttendanceReportPanel from "./history/AttendanceReportPanel.jsx";

const VIEWS = [
  { id: "activity", label: "Activity Log" },
  { id: "report", label: "Attendance Report" },
];

export default function HistoryScreen({ session }) {
  const [view, setView] = useState("activity");

  return (
    <div className="page">
      <PageHeader
        title="History"
        description="Review recent activity or build an attendance report for one Group."
      />

      <div className="history-view-switch" role="tablist" aria-label="History views">
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
              onClick={() => setView(item.id)}
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
