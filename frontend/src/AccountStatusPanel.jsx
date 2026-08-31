import { useCallback, useEffect, useRef, useState } from "react";
import {
  MANUAL_REFRESH_FAILURE_MS,
  MANUAL_REFRESH_SUCCESS_MS,
  accountStatusRefreshButtonDisabled,
  accountStatusRefreshButtonLabel,
  canStartManualStatusRefresh,
} from "./accountStatusRefresh.js";
import { fetchStatusSnapshot, statusPollDelayMs } from "./statusApi.js";
import { formatStatusTime, statusSnapshotContent } from "./statusPresentation.js";

function statusClass(value) {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function StatusEmpty({ children }) {
  return <p className="account-status-empty"><span aria-hidden="true">✓</span>{children}</p>;
}

function IncidentCard({ incident, recent = false }) {
  const when = recent
    ? `Resolved ${formatStatusTime(incident.resolved_at || incident.started_at)}`
    : `Started ${formatStatusTime(incident.started_at)}`;
  return (
    <article className={`account-status-incident${recent ? " is-resolved" : ""}`}>
      <div className="account-status-incident-heading">
        <h4>{incident.title || "Service incident"}</h4>
        <span>{incident.status_label || (recent ? "Resolved" : "Investigating")}</span>
      </div>
      <p className="account-status-meta">{when}</p>
      {incident.summary ? <p>{incident.summary}</p> : null}
      {Array.isArray(incident.updates) && incident.updates.length ? (
        <ul className="account-status-updates">
          {incident.updates.map((update, index) => (
            <li key={`${update.at || "update"}-${index}`}>
              <time>{formatStatusTime(update.at)}</time>
              <span>{update.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function StatusSnapshotView({ snapshot }) {
  const { current, overall, groups, active, recent, maintenance } = statusSnapshotContent(snapshot);

  return (
    <div className="account-status-content">
      <section className={`account-status-overall is-${statusClass(overall.state)}`}>
        <div>
          <p className="account-info-eyebrow">Current system status</p>
          <h3>{overall.label || "Status unavailable"}</h3>
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
                    {component.label || "Unknown"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="account-status-detail-grid">
        <section className="account-status-detail-card">
          <h3>Active incidents</h3>
          {active.length
            ? active.map((incident) => <IncidentCard incident={incident} key={incident.id} />)
            : <StatusEmpty>No active incidents</StatusEmpty>}
        </section>
        <section className="account-status-detail-card">
          <h3>Recent incidents</h3>
          {recent.length
            ? recent.map((incident) => <IncidentCard incident={incident} recent key={incident.id} />)
            : <StatusEmpty>No recent incidents</StatusEmpty>}
        </section>
        <section className="account-status-detail-card">
          <h3>Scheduled maintenance</h3>
          {maintenance.length ? maintenance.map((window) => (
            <article className="account-status-maintenance" key={window.id}>
              <div className="account-status-incident-heading">
                <h4>{window.title}</h4>
                {window.active ? <span>In progress</span> : window.upcoming ? <span>Upcoming</span> : null}
              </div>
              <p className="account-status-meta">
                {formatStatusTime(window.starts_at)} – {formatStatusTime(window.ends_at)}
              </p>
              {window.note ? <p>{window.note}</p> : null}
            </article>
          )) : <StatusEmpty>No scheduled maintenance</StatusEmpty>}
        </section>
      </div>

      <p className="account-status-refresh-meta">
        Last checked: {formatStatusTime(current.last_checked_at)} · Auto-updates every {Number(current.poll_interval_seconds) || 30} seconds
      </p>
    </div>
  );
}

export function StatusPanelBody({ snapshot, error, refreshing }) {
  return (
    <>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {!snapshot && refreshing ? (
        <div className="loading-state" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Loading system status…</span>
        </div>
      ) : null}
      {!snapshot && error ? (
        <div className="account-panel-empty">
          <p>Status could not be loaded. Use Refresh to try again.</p>
        </div>
      ) : null}
      {snapshot ? <StatusSnapshotView snapshot={snapshot} /> : null}
    </>
  );
}

export default function AccountStatusPanel() {
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
        const next = await fetchStatusSnapshot({ signal: controller.signal });
        if (!active) return;
        setSnapshot(next);
        setError("");
        timer = window.setTimeout(() => poll(false), statusPollDelayMs(next));
      } catch (loadError) {
        if (!active || loadError?.name === "AbortError") return;
        setError("Live status data is temporarily unavailable.");
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
  }, []);

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
      const next = await fetchStatusSnapshot({ signal: controller.signal });
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
  }, [clearManualRefreshResetTimer, scheduleManualRefreshReset]);

  const refreshLabel = accountStatusRefreshButtonLabel(manualRefresh);
  const refreshLoading = manualRefresh === "loading";
  const refreshSuccess = manualRefresh === "success";

  return (
    <section className="account-info-panel account-status-panel" aria-labelledby="account-status-title" data-tutorial-target="account-status">
      <header className="account-info-hero account-status-hero">
        <div>
          <p className="account-info-eyebrow">CheckStation systems</p>
          <h2 id="account-status-title">Status</h2>
          <p>Live service health, incidents, and planned maintenance.</p>
        </div>
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
      </header>
      <StatusPanelBody snapshot={snapshot} error={error} refreshing={initialLoading} />
    </section>
  );
}
