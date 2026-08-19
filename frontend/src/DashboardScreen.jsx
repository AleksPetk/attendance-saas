import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "./api.js";
import {
  ActionBadge,
  EmptyState,
  LoadingState,
  PageHeader,
  StatCard,
} from "./components.jsx";

function ActivityRow({ item }) {
  const when = item.performed_at ? new Date(item.performed_at) : null;
  const timeStr = when
    ? when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  const dateStr = when ? when.toLocaleDateString([], { month: "short", day: "numeric" }) : "";

  return (
    <article className="activity-row">
      <ActionBadge action={item.action} />
      <div className="activity-row-main">
        <strong>{item.person?.name || "Unknown"}</strong>
        <p className="activity-row-meta">
          {item.group_name} · {item.source}
        </p>
      </div>
      <div className="activity-row-meta" style={{ textAlign: "right" }}>
        <strong>{timeStr}</strong>
        <div>{dateStr}</div>
      </div>
    </article>
  );
}

export default function DashboardScreen() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const result = await api.dashboard(null);
        if (cancelled) return;
        setData(result.data);
      } catch (e) {
        if (cancelled) return;
        setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Loading dashboard…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <EmptyState title="Could not load dashboard" body={error} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Your workspace at a glance — real counts and recent check-in activity."
      />

      <div className="dashboard-metrics">
        <StatCard
          label="Members"
          value={data.member_count}
          hint="Reusable people in workspace"
          accent="blue"
          onClick={() => nav("/members")}
        />
        <StatCard
          label="Groups"
          value={data.group_count}
          hint="Check-in configurations"
          accent="green"
          onClick={() => nav("/groups")}
        />
        <StatCard
          label="Recent actions"
          value={data.recent_activity?.length || 0}
          hint="Shown below"
          accent="cyan"
        />
      </div>

      <div className="dashboard-row">
        <section className="section-card">
          <header className="section-card-header">
            <h2>Recent activity</h2>
            <p>Latest action records from kiosk operations.</p>
          </header>
          <div className="section-card-body">
            {data.recent_activity?.length ? (
              <div className="activity-list">
                {data.recent_activity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No activity yet"
                body="Launch a kiosk and record a check-in to see activity here."
                action={
                  <button type="button" className="btn-primary" onClick={() => nav("/groups")}>
                    Go to Groups
                  </button>
                }
              />
            )}
          </div>
        </section>

        <aside className="card-surface" style={{ padding: "var(--space-5)" }}>
          <h3 style={{ marginBottom: "var(--space-4)", fontSize: "1rem" }}>Quick actions</h3>
          <div className="quick-actions">
            <button type="button" className="quick-action-btn" onClick={() => nav("/members/new")}>
              <span aria-hidden="true">+</span> Add Member
            </button>
            <button type="button" className="quick-action-btn" onClick={() => nav("/groups/new")}>
              <span aria-hidden="true">+</span> Create Group
            </button>
            <button type="button" className="quick-action-btn" onClick={() => nav("/history")}>
              <span aria-hidden="true">↻</span> View history
            </button>
            <button type="button" className="quick-action-btn" onClick={() => nav("/groups")}>
              <span aria-hidden="true">▣</span> Launch kiosk
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
