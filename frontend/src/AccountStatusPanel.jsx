import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MANUAL_REFRESH_FAILURE_MS,
  MANUAL_REFRESH_SUCCESS_MS,
  accountStatusRefreshButtonDisabled,
  accountStatusRefreshButtonLabel,
  canStartManualStatusRefresh,
} from "./accountStatusRefresh.js";
import { workspaceStatusHomeUrl } from "./publicFooterLinks.js";
import { fetchStatusSnapshot, statusPollDelayMs } from "./statusApi.js";
import {
  formatStatusTime,
  serviceLayerTitles,
  statusSnapshotContent,
} from "./statusPresentation.js";

function statusClass(value) {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function StatusEmpty({ children }) {
  return <p className="account-status-empty"><span aria-hidden="true">✓</span>{children}</p>;
}

function IncidentCard({ incident, recent = false, locale, t }) {
  const time = formatStatusTime(
    recent ? incident.resolved_at || incident.started_at : incident.started_at,
    locale,
    t("account:statusPanel.notCheckedYet"),
  );
  const when = recent
    ? t("account:statusPanel.resolvedAt", { time })
    : t("account:statusPanel.started", { time });
  return (
    <article className={`account-status-incident${recent ? " is-resolved" : ""}`}>
      <div className="account-status-incident-heading">
        <h4>{incident.title || t("account:statusPanel.serviceIncident")}</h4>
        <span>
          {incident.status_label ||
            (recent
              ? t("account:statusPanel.resolved")
              : t("account:statusPanel.investigating"))}
        </span>
      </div>
      <p className="account-status-meta">{when}</p>
      {incident.summary ? <p>{incident.summary}</p> : null}
      {Array.isArray(incident.updates) && incident.updates.length ? (
        <ul className="account-status-updates">
          {incident.updates.map((update, index) => (
            <li key={`${update.at || "update"}-${index}`}>
              <time>
                {formatStatusTime(update.at, locale, t("account:statusPanel.notCheckedYet"))}
              </time>
              <span>{update.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function StatusSnapshotView({ snapshot, locale = "en", t }) {
  const titles = serviceLayerTitles(t);
  const { current, overall, groups, active, recent, maintenance } = statusSnapshotContent(
    snapshot,
    titles,
  );

  return (
    <div className="account-status-content">
      <section className={`account-status-overall is-${statusClass(overall.state)}`}>
        <div>
          <p className="account-info-eyebrow">{t("account:statusPanel.currentSystemStatus")}</p>
          <h3>{overall.label || t("account:statusPanel.statusUnavailable")}</h3>
        </div>
        <span className="account-status-overall-dot" aria-hidden="true" />
      </section>

      <div className="account-status-service-groups">
        {groups.map((group) => (
          <section className="account-status-service-group" key={group.id}>
            <h3>{group.title}</h3>
            <ul>
              {group.items.map((component) => (
                <li key={component.id} className={`is-${statusClass(component.state)}`}>
                  <div>
                    <strong>{component.name}</strong>
                    {component.description ? <p>{component.description}</p> : null}
                  </div>
                  <span className="account-status-service-state">
                    <i aria-hidden="true" />
                    {component.label || t("account:statusPanel.unknown")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="account-status-detail-grid">
        <section className="account-status-detail-card">
          <h3>{t("account:statusPanel.activeIncidents")}</h3>
          {active.length
            ? active.map((incident) => (
                <IncidentCard incident={incident} key={incident.id} locale={locale} t={t} />
              ))
            : <StatusEmpty>{t("account:statusPanel.noActiveIncidents")}</StatusEmpty>}
        </section>
        <section className="account-status-detail-card">
          <h3>{t("account:statusPanel.recentIncidents")}</h3>
          {recent.length
            ? recent.map((incident) => (
                <IncidentCard
                  incident={incident}
                  recent
                  key={incident.id}
                  locale={locale}
                  t={t}
                />
              ))
            : <StatusEmpty>{t("account:statusPanel.noRecentIncidents")}</StatusEmpty>}
        </section>
        <section className="account-status-detail-card">
          <h3>{t("account:statusPanel.scheduledMaintenance")}</h3>
          {maintenance.length ? maintenance.map((window) => (
            <article className="account-status-maintenance" key={window.id}>
              <div className="account-status-incident-heading">
                <h4>{window.title}</h4>
                {window.active ? <span>{t("account:statusPanel.inProgress")}</span> : null}
                {!window.active && window.upcoming ? (
                  <span>{t("account:statusPanel.upcoming")}</span>
                ) : null}
              </div>
              <p className="account-status-meta">
                {formatStatusTime(window.starts_at, locale, t("account:statusPanel.notCheckedYet"))}
                {" – "}
                {formatStatusTime(window.ends_at, locale, t("account:statusPanel.notCheckedYet"))}
              </p>
              {window.note ? <p>{window.note}</p> : null}
            </article>
          )) : <StatusEmpty>{t("account:statusPanel.noScheduledMaintenance")}</StatusEmpty>}
        </section>
      </div>

      <p className="account-status-refresh-meta">
        {t("account:statusPanel.lastChecked", {
          time: formatStatusTime(
            current.last_checked_at,
            locale,
            t("account:statusPanel.notCheckedYet"),
          ),
          seconds: Number(current.poll_interval_seconds) || 30,
        })}
      </p>
    </div>
  );
}

export function StatusPanelBody({ snapshot, error, refreshing, locale = "en", t }) {
  return (
    <>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {!snapshot && refreshing ? (
        <div className="loading-state" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <span>{t("account:statusPanel.loading")}</span>
        </div>
      ) : null}
      {!snapshot && error ? (
        <div className="account-panel-empty">
          <p>{t("account:statusPanel.loadError")}</p>
        </div>
      ) : null}
      {snapshot ? <StatusSnapshotView snapshot={snapshot} locale={locale} t={t} /> : null}
    </>
  );
}

export default function AccountStatusPanel({ contentLang = "en" }) {
  const { t } = useTranslation();
  const resolvedLang = contentLang === "ja" ? "ja" : "en";
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [manualRefresh, setManualRefresh] = useState("idle");
  const manualRefreshInFlight = useRef(false);
  const manualRefreshController = useRef(null);
  const manualRefreshResetTimer = useRef(null);

  const clearManualRefreshResetTimer = useCallback(() => {
    if (manualRefreshResetTimer.current) {
      window.clearTimeout(manualRefreshResetTimer.current);
      manualRefreshResetTimer.current = null;
    }
  }, []);

  const scheduleManualRefreshReset = useCallback((delayMs) => {
    clearManualRefreshResetTimer();
    manualRefreshResetTimer.current = window.setTimeout(() => {
      setManualRefresh("idle");
      manualRefreshResetTimer.current = null;
    }, delayMs);
  }, [clearManualRefreshResetTimer]);

  useEffect(() => {
    let active = true;
    let timer = null;
    const controller = new AbortController();

    async function poll(isInitial = false) {
      if (isInitial) setInitialLoading(true);
      try {
        const next = await fetchStatusSnapshot({
          signal: controller.signal,
          lang: resolvedLang,
        });
        if (!active) return;
        setSnapshot(next);
        setError("");
        timer = window.setTimeout(() => poll(false), statusPollDelayMs(next));
      } catch (loadError) {
        if (!active || loadError?.name === "AbortError") return;
        setError(t("account:statusPanel.unavailable"));
        timer = window.setTimeout(() => poll(false), 30000);
      } finally {
        if (active && isInitial) setInitialLoading(false);
      }
    }

    poll(true);
    return () => {
      active = false;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [resolvedLang, t]);

  useEffect(() => () => {
    clearManualRefreshResetTimer();
    manualRefreshController.current?.abort();
  }, [clearManualRefreshResetTimer]);

  const handleManualRefresh = useCallback(async () => {
    if (!canStartManualStatusRefresh(manualRefreshInFlight.current)) return;

    clearManualRefreshResetTimer();
    manualRefreshController.current?.abort();

    const controller = new AbortController();
    manualRefreshController.current = controller;
    manualRefreshInFlight.current = true;
    setManualRefresh("loading");

    try {
      const next = await fetchStatusSnapshot({
        signal: controller.signal,
        lang: resolvedLang,
      });
      if (controller.signal.aborted) return;
      setSnapshot(next);
      setError("");
      setManualRefresh("success");
      scheduleManualRefreshReset(MANUAL_REFRESH_SUCCESS_MS);
    } catch (loadError) {
      if (loadError?.name === "AbortError") return;
      setManualRefresh("error");
      scheduleManualRefreshReset(MANUAL_REFRESH_FAILURE_MS);
    } finally {
      if (manualRefreshController.current === controller) {
        manualRefreshController.current = null;
      }
      manualRefreshInFlight.current = false;
    }
  }, [clearManualRefreshResetTimer, resolvedLang, scheduleManualRefreshReset]);

  const refreshLabel = accountStatusRefreshButtonLabel(manualRefresh, {
    refresh: t("account:statusPanel.refresh"),
    refreshing: t("account:statusPanel.refreshing"),
    updated: t("account:statusPanel.updated"),
    refreshFailed: t("account:statusPanel.refreshFailed"),
  });
  const refreshLoading = manualRefresh === "loading";
  const refreshSuccess = manualRefresh === "success";

  return (
    <section className="account-info-panel account-status-panel" aria-labelledby="account-status-title" data-tutorial-target="account-status">
      <header className="account-info-hero account-status-hero">
        <div>
          <p className="account-info-eyebrow">{t("account:statusPanel.eyebrow")}</p>
          <h2 id="account-status-title">{t("account:statusPanel.title")}</h2>
          <p>{t("account:statusPanel.description")}</p>
        </div>
        <div className="account-status-hero-actions">
          <a
            className="btn-secondary btn-sm"
            href={workspaceStatusHomeUrl(resolvedLang)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("account:statusPanel.openStatus")}
          </a>
          <button
            type="button"
            className={[
              "btn-secondary",
              "btn-sm",
              "account-status-refresh-btn",
              refreshLoading ? "btn-loading" : "",
              refreshSuccess ? "is-updated" : "",
              manualRefresh === "error" ? "is-error" : "",
            ].filter(Boolean).join(" ")}
            disabled={accountStatusRefreshButtonDisabled(manualRefresh)}
            onClick={handleManualRefresh}
            aria-live="polite"
          >
            {refreshLoading ? <span className="btn-spinner" aria-hidden="true" /> : null}
            {refreshSuccess ? <span className="account-status-refresh-check" aria-hidden="true">✓</span> : null}
            <span className="btn-label">{refreshLabel}</span>
          </button>
        </div>
      </header>
      <StatusPanelBody
        snapshot={snapshot}
        error={error}
        refreshing={initialLoading}
        locale={resolvedLang}
        t={t}
      />
    </section>
  );
}
