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
import {
  resolveInitialStatusLocale,
  resolveStatusLocale,
  saveStatusLocalePreference,
  statusPathFor,
  statusUi,
} from "./locale.js";
import { mountStatusLanguageMenu } from "./language-menu.js";

const DEFAULT_POLL_MS = 30000;

let currentLocale = "en";
let languageMenu = null;

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

function ensureLocalePath() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") {
    const locale = resolveInitialStatusLocale("/");
    window.location.replace(statusPathFor(locale));
    return null;
  }
  if (!resolveStatusLocale(path)) {
    const locale = resolveInitialStatusLocale(path);
    window.location.replace(statusPathFor(locale));
    return null;
  }
  return resolveStatusLocale(path);
}

function updateChrome(locale) {
  const ui = statusUi(locale);
  document.documentElement.lang = locale;
  document.title = ui.siteTitle;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", ui.siteDescription);
  const kicker = document.getElementById("status-kicker");
  if (kicker) kicker.textContent = ui.systemStatus;
  const componentsCard = document.querySelector(".components-card");
  if (componentsCard) componentsCard.setAttribute("aria-label", ui.componentsAria);
  const activeHeading = $("active-heading");
  if (activeHeading) activeHeading.textContent = ui.activeIncidents;
  const recentHeading = $("recent-heading");
  if (recentHeading) recentHeading.textContent = ui.recentIncidents;
  const maintenanceHeading = $("maintenance-heading");
  if (maintenanceHeading) maintenanceHeading.textContent = ui.scheduledMaintenance;
  if (languageMenu) languageMenu.update(locale);
}

function renderOverall(current) {
  const ui = statusUi(currentLocale);
  const overall = current.overall || unavailablePayload(currentLocale).overall;
  const section = $("overall");
  section.className = `overall overall-${overall.state || "unavailable"}`;
  $("overall-label").textContent = overall.label || ui.statusUnavailable;
  const summary = overallNarrative(current, currentLocale);
  const summaryEl = $("overall-summary");
  summaryEl.hidden = !summary;
  summaryEl.textContent = summary;
  $("overall-checked").textContent = formatLastChecked(
    current.last_checked_at,
    currentLocale,
  );
  $("overall-poll").textContent = formatAutoUpdate(
    current.poll_interval_seconds,
    currentLocale,
  );
}

function renderComponentRow(component) {
  const ui = statusUi(currentLocale);
  const state = component.state || "unknown";
  const label = component.label || ui.unknown;
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
  const ui = statusUi(currentLocale);
  const root = $("components");
  const components = current.components || [];
  if (!components.length) {
    root.innerHTML = `<div class="component-group">
      <ul class="component-list">
        <li class="component-row component-unknown">
          <div class="component-copy-block">
            <div class="component-name">${escapeHtml(ui.allComponents)}</div>
            <p class="component-copy">${escapeHtml(ui.dataUnavailable)}</p>
          </div>
          <div class="component-state">
            <span class="status-dot" aria-hidden="true"></span>
            <span>${escapeHtml(ui.unknown)}</span>
          </div>
        </li>
      </ul>
    </div>`;
    return;
  }
  const groups = groupComponents(components, currentLocale);
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
  const ui = statusUi(currentLocale);
  const root = $("active-incidents");
  if (!incidents || !incidents.length) {
    root.innerHTML = emptyState(ui.noActiveIncidents);
    return;
  }
  root.innerHTML = incidents
    .map((incident) => {
      const started = formatExactTime(incident.started_at, currentLocale);
      const relative = formatRelativeTime(incident.started_at, Date.now(), currentLocale);
      const startedLine = started
        ? `${ui.started} ${started}${relative ? ` · ${relative}` : ""}`
        : "";
      return `<article class="incident incident-active">
        <div class="incident-topline">
          <h3>${escapeHtml(incidentTitle(incident, currentLocale))}</h3>
          <span class="incident-badge">${escapeHtml(incident.status_label || ui.investigating)}</span>
        </div>
        <p class="incident-meta">${escapeHtml(startedLine)}</p>
        <p class="incident-summary">${escapeHtml(incidentDisplaySummary(incident, currentLocale))}</p>
      </article>`;
    })
    .join("");
}

function renderRecentIncidents(incidents) {
  const ui = statusUi(currentLocale);
  const root = $("recent-incidents");
  const recent = limitRecentIncidents(incidents);
  if (!recent.length) {
    root.innerHTML = emptyState(ui.noRecentIncidents);
    return;
  }
  root.innerHTML = recent
    .map((incident) => {
      const resolvedExact = formatExactTime(
        incident.resolved_at || incident.started_at,
        currentLocale,
      );
      const relative = formatRelativeTime(
        incident.resolved_at || incident.started_at,
        Date.now(),
        currentLocale,
      );
      const duration = formatDuration(
        incident.started_at,
        incident.resolved_at,
        currentLocale,
      );
      const durationBit = duration ? ` · ${ui.lasted} ${duration}` : "";
      const when = resolvedExact
        ? `${ui.resolved} ${resolvedExact}${relative ? ` · ${relative}` : ""}${durationBit}`
        : ui.resolved;
      return `<article class="incident incident-recent">
        <div class="incident-topline">
          <h3>${escapeHtml(incidentTitle(incident, currentLocale))}</h3>
          <span class="incident-badge incident-badge-resolved">${escapeHtml(ui.resolved)}</span>
        </div>
        <p class="incident-meta">${escapeHtml(when)}</p>
        <p class="incident-summary">${escapeHtml(incidentDisplaySummary(incident, currentLocale))}</p>
      </article>`;
    })
    .join("");
}

function renderMaintenance(windows) {
  const ui = statusUi(currentLocale);
  const root = $("maintenance");
  if (!windows || !windows.length) {
    root.innerHTML = emptyState(ui.noScheduledMaintenance);
    return;
  }
  root.innerHTML = windows
    .map((windowItem) => {
      const start = formatExactTime(windowItem.starts_at, currentLocale);
      const end = formatExactTime(windowItem.ends_at, currentLocale);
      return `<article class="incident">
        <h3>${escapeHtml(windowItem.title)}</h3>
        <p class="incident-meta">${escapeHtml(start)} – ${escapeHtml(end)}</p>
        <p class="incident-summary">${escapeHtml(windowItem.note || "")}</p>
      </article>`;
    })
    .join("");
}

function renderUnavailable() {
  const ui = statusUi(currentLocale);
  const fallback = unavailablePayload(currentLocale);
  renderOverall(fallback);
  renderComponents(fallback);
  const message = `<p class="empty-state">${escapeHtml(ui.dataUnavailable)}</p>`;
  $("active-incidents").innerHTML = message;
  $("recent-incidents").innerHTML = message;
  $("maintenance").innerHTML = message;
}

function apiUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}lang=${encodeURIComponent(currentLocale)}`;
}

async function loadStatus() {
  try {
    const [currentRes, incidentsRes, maintenanceRes] = await Promise.all([
      fetch(apiUrl("/api/status/current/"), { cache: "no-store" }),
      fetch(apiUrl("/api/status/incidents/"), { cache: "no-store" }),
      fetch(apiUrl("/api/status/maintenance/"), { cache: "no-store" }),
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

async function applyLocale(locale) {
  currentLocale = locale;
  saveStatusLocalePreference(locale);
  updateChrome(locale);
  return loadStatus();
}

async function start() {
  const locale = ensureLocalePath();
  if (!locale) return;
  currentLocale = locale;
  saveStatusLocalePreference(locale);
  languageMenu = mountStatusLanguageMenu($("status-language-root"), {
    locale,
    onNavigate(href, nextLocale) {
      window.history.pushState({}, "", href);
      applyLocale(nextLocale).then(() => window.scrollTo(0, 0));
    },
  });
  updateChrome(locale);
  const delay = await loadStatus();
  window.setInterval(() => {
    loadStatus();
  }, delay || DEFAULT_POLL_MS);
  window.addEventListener("popstate", () => {
    const next = resolveStatusLocale(window.location.pathname) || "en";
    applyLocale(next);
  });
}

start();
