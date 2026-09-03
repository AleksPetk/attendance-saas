import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "./api.js";
import {
  ActionBadge,
  EmptyState,
  LoadingState,
  PageHeader,
  StatCard,
} from "./components.jsx";
import AdBanner from "./advertising/AdBanner.jsx";
import { PLACEMENT_DASHBOARD_BANNER } from "./advertising/placements.js";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import { formatDate } from "./i18n/format.js";
import { usePageTitle } from "./i18n/usePageTitle.js";
import { canManageGroupConfiguration, canViewGlobalMembers } from "./workspaceSession.js";

function ActivityRow({ item, locale }) {
  const { t } = useTranslation("common");
  const when = item.performed_at ? new Date(item.performed_at) : null;
  const timeStr = when
    ? when.toLocaleTimeString(locale === "ja" ? "ja-JP" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const dateStr = when ? formatDate(when, locale, { month: "short", day: "numeric" }) : "";

  return (
    <article className="activity-row">
      <ActionBadge action={item.action} />
      <div className="activity-row-main">
        <strong>{item.person?.name || t("unknown")}</strong>
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

export default function DashboardScreen({ session }) {
  const { t, i18n } = useTranslation(["workspace", "errors"]);
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const showMembers = canViewGlobalMembers(session);
  const canConfigure = canManageGroupConfiguration(session);

  usePageTitle("pageTitles.dashboard");

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
        setError(localizedErrorMessage(e, t));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (loading) {
    return (
      <div className="page">
        <LoadingState label={t("dashboard.loading")} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <EmptyState title={t("dashboard.loadErrorTitle")} body={error} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.title")}
        description={t("dashboard.description")}
      />
      <AdBanner session={session} placement={PLACEMENT_DASHBOARD_BANNER} />

      <div className="dashboard-metrics" data-tutorial-target="workspace-dashboard">
        {showMembers ? (
          <StatCard
            label={t("dashboard.stats.members")}
            value={data?.member_count ?? 0}
            hint={t("dashboard.stats.membersHint")}
            accent="blue"
            onClick={() => nav("/members")}
          />
        ) : null}
        <StatCard
          label={t("dashboard.stats.groups")}
          value={data?.group_count ?? 0}
          hint={showMembers ? t("dashboard.stats.groupsHintMembers") : t("dashboard.stats.groupsHintStaff")}
          accent="green"
          onClick={() => nav("/groups")}
        />
        <StatCard
          label={t("dashboard.stats.recentActions")}
          value={data?.recent_activity?.length || 0}
          hint={t("dashboard.stats.recentActionsHint")}
          accent="cyan"
        />
      </div>

      <div className="dashboard-row" data-tutorial-target="dashboard-workflow">
        <section className="section-card">
          <header className="section-card-header">
            <h2>{t("dashboard.recentActivity.title")}</h2>
            <p>{t("dashboard.recentActivity.description")}</p>
          </header>
          <div className="section-card-body">
            {data.recent_activity?.length ? (
              <div className="activity-list">
                {data.recent_activity.map((item) => (
                  <ActivityRow key={item.id} item={item} locale={i18n.language} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={t("dashboard.empty.title")}
                body={t("dashboard.empty.body")}
                action={
                  <button type="button" className="btn-primary" onClick={() => nav("/groups")}>
                    {t("dashboard.empty.action")}
                  </button>
                }
              />
            )}
          </div>
        </section>

        <aside className="card-surface" style={{ padding: "var(--space-5)" }}>
          <h3 style={{ marginBottom: "var(--space-4)", fontSize: "1rem" }}>
            {t("dashboard.quickActions.title")}
          </h3>
          <div className="quick-actions">
            {showMembers ? (
              <button type="button" className="quick-action-btn" onClick={() => nav("/members/new")}>
                <span aria-hidden="true">+</span> {t("dashboard.quickActions.addMember")}
              </button>
            ) : null}
            {canConfigure ? (
              <button type="button" className="quick-action-btn" onClick={() => nav("/groups/new")}>
                <span aria-hidden="true">+</span> {t("dashboard.quickActions.createGroup")}
              </button>
            ) : null}
            <button type="button" className="quick-action-btn" onClick={() => nav("/history")}>
              <span aria-hidden="true">↻</span> {t("dashboard.quickActions.viewHistory")}
            </button>
            <button type="button" className="quick-action-btn" onClick={() => nav("/groups")}>
              <span aria-hidden="true">▣</span> {t("dashboard.quickActions.launchKiosk")}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
