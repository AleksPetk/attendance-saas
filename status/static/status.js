import {
  formatAutoUpdate,
  formatDuration,
  formatExactTime,
  formatLastChecked,
  formatRelativeTime,
  groupComponents,
  incidentDisplaySummary,
  incidentTitle,
  limitRecentIncidents,
  overallNarrative,
  unavailablePayload,
} from "./status-view.js";

const DEFAULT_POLL_MS = 30000;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderOverall(current) {
  const overall = current.overall || unavailablePayload().overall;
  const section = $("overall");
  section.className = `overall overall-${overall.state || "unavailable"}`;
  $("overall-label").textContent = overall.label || "Status unavailable";
  const summary = overallNarrative(current);
  const summaryEl = $("overall-summary");
  summaryEl.hidden = !summary;
  summaryEl.textContent = summary;
  const poll = formatAutoUpdate(current.poll_interval_seconds);
  $("overall-checked").textContent = formatLastChecked(current.last_checked_at);
  $("overall-poll").textContent = poll;
}

function renderComponentRow(component) {
  const state = component.state || "unknown";
  const label = component.label || "Unknown";
  const description = component.description
    ? `<p class="component-copy">${escapeHtml(component.description)}</p>`
    : "";
  return `<li class="component-row component-${escapeHtml(state)}">
    <div class="component-copy-block">
      <div class="component-name">${escapeHtml(component.name || component.id)}</div>
      ${description}
    </div>
    <div class="component-state" aria-label="${escapeHtml(label)}">
      <span class="status-dot" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </div>
  </li>`;
}

function renderComponents(current) {
  const root = $("components");
  const components = current.components || [];
  if (!components.length) {
    root.innerHTML = `<div class="component-group">
      <ul class="component-list">
        <li class="component-row component-unknown">
          <div class="component-copy-block">
            <div class="component-name">All components</div>
            <p class="component-copy">Status data is unavailable.</p>
          </div>
          <div class="component-state">
            <span class="status-dot" aria-hidden="true"></span>
            <span>Unknown</span>
          </div>
        </li>
      </ul>
    </div>`;
    return;
  }
  const groups = groupComponents(components);
  root.innerHTML = groups
    .map((group) => {
      return `<div class="component-group">
        <h2 class="component-group-title">${escapeHtml(group.title)}</h2>
        <ul class="component-list">
          ${group.items.map(renderComponentRow).join("")}
        </ul>
      </div>`;
    })
    .join("");
}

function emptyState(text) {
  return `<p class="empty-state"><span class="empty-mark" aria-hidden="true">✓</span>${escapeHtml(text)}</p>`;
}

function renderActiveIncidents(incidents) {
  const root = $("active-incidents");
  if (!incidents || !incidents.length) {
    root.innerHTML = emptyState("No active incidents");
    return;
  }
  root.innerHTML = incidents
    .map((incident) => {
      const started = formatExactTime(incident.started_at);
      const relative = formatRelativeTime(incident.started_at);
      const startedLine = started
        ? `Started ${started}${relative ? ` · ${relative}` : ""}`
        : "";
      return `<article class="incident incident-active">
        <div class="incident-topline">
          <h3>${escapeHtml(incidentTitle(incident))}</h3>
          <span class="incident-badge">${escapeHtml(incident.status_label || "Investigating")}</span>
        </div>
        <p class="incident-meta">${escapeHtml(startedLine)}</p>
        <p class="incident-summary">${escapeHtml(incidentDisplaySummary(incident))}</p>
      </article>`;
    })
    .join("");
}

function renderRecentIncidents(incidents) {
  const root = $("recent-incidents");
  const recent = limitRecentIncidents(incidents);
  if (!recent.length) {
    root.innerHTML = emptyState("No recent incidents");
    return;
  }
  root.innerHTML = recent
    .map((incident) => {
      const resolvedExact = formatExactTime(incident.resolved_at || incident.started_at);
      const relative = formatRelativeTime(incident.resolved_at || incident.started_at);
      const duration = formatDuration(incident.started_at, incident.resolved_at);
      const durationBit = duration ? ` · Lasted ${duration}` : "";
      const when = resolvedExact
        ? `Resolved ${resolvedExact}${relative ? ` · ${relative}` : ""}${durationBit}`
        : "Resolved";
      return `<article class="incident incident-recent">
        <div class="incident-topline">
          <h3>${escapeHtml(incidentTitle(incident))}</h3>
          <span class="incident-badge incident-badge-resolved">Resolved</span>
        </div>
        <p class="incident-meta">${escapeHtml(when)}</p>
        <p class="incident-summary">${escapeHtml(incidentDisplaySummary(incident))}</p>
      </article>`;
    })
    .join("");
}

function renderMaintenance(windows) {
  const root = $("maintenance");
  if (!windows || !windows.length) {
    root.innerHTML = emptyState("No scheduled maintenance");
    return;
  }
  root.innerHTML = windows
    .map((windowItem) => {
      const start = formatExactTime(windowItem.starts_at);
      const end = formatExactTime(windowItem.ends_at);
      return `<article class="incident">
        <h3>${escapeHtml(windowItem.title)}</h3>
        <p class="incident-meta">${escapeHtml(start)} – ${escapeHtml(end)}</p>
        <p class="incident-summary">${escapeHtml(windowItem.note || "")}</p>
      </article>`;
    })
    .join("");
}

function renderUnavailable() {
  const fallback = unavailablePayload();
  renderOverall(fallback);
  renderComponents(fallback);
  const message = '<p class="empty-state">Status data is unavailable.</p>';
  $("active-incidents").innerHTML = message;
  $("recent-incidents").innerHTML = message;
  $("maintenance").innerHTML = message;
}

async function loadStatus() {
  try {
    const [currentRes, incidentsRes, maintenanceRes] = await Promise.all([
      fetch("/api/status/current/", { cache: "no-store" }),
      fetch("/api/status/incidents/", { cache: "no-store" }),
      fetch("/api/status/maintenance/", { cache: "no-store" }),
    ]);
    if (!currentRes.ok) throw new Error("status unavailable");
    const current = await currentRes.json();
    const incidents = incidentsRes.ok
      ? await incidentsRes.json()
      : { active: [], recent: [] };
    const maintenance = maintenanceRes.ok
      ? await maintenanceRes.json()
      : { windows: [] };
    renderOverall(current);
    renderComponents(current);
    renderActiveIncidents(incidents.active);
    renderRecentIncidents(incidents.recent);
    renderMaintenance(maintenance.windows);
    return Number(current.poll_interval_seconds || 30) * 1000;
  } catch (error) {
    renderUnavailable();
    return DEFAULT_POLL_MS;
  }
}

async function start() {
  const delay = await loadStatus();
  window.setInterval(() => {
    loadStatus();
  }, delay || DEFAULT_POLL_MS);
}

start();
