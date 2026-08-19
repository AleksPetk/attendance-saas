const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function getCookie(name) {
  if (typeof document === "undefined") return "";
  const raw = document.cookie || "";
  const parts = raw.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (!p) continue;
    const [k, v] = p.split("=");
    if (k === name) return decodeURIComponent(v || "");
  }
  return "";
}

async function parseError(response) {
  try {
    const data = await response.json();
    return { status: response.status, data };
  } catch {
    return { status: response.status, data: { detail: `Request failed (${response.status})` } };
  }
}

function shouldAttachCsrf(method) {
  const m = (method || "GET").toUpperCase();
  return !["GET", "HEAD", "OPTIONS"].includes(m);
}

async function request(path, { method = "GET", json, formData } = {}) {
  const headers = {};
  const m = method.toUpperCase();

  let body;
  if (formData) {
    body = formData;
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  if (shouldAttachCsrf(m)) {
    const csrf = getCookie("checkstation_csrftoken");
    if (csrf) {
      headers["X-CSRFToken"] = csrf;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: m,
    headers,
    body,
    credentials: "include",
  });
  if (response.status === 204) {
    return { ok: true, status: 204, data: null };
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  return { ok: true, status: response.status, data: await response.json() };
}

export const api = {
  baseUrl: API_BASE_URL,

  /* Workspace auth/session endpoints */
  csrf: () => request("/api/auth/csrf/"),
  registerOwner: (payload) => request("/api/auth/register/", { method: "POST", json: payload }),
  loginOwner: (payload) => request("/api/auth/login/", { method: "POST", json: payload }),
  loginStaff: (payload) => request("/api/auth/staff-login/", { method: "POST", json: payload }),
  logout: () => request("/api/auth/logout/", { method: "POST" }),
  reauth: (payload) => request("/api/auth/reauth/", { method: "POST", json: payload }),
  verifyEmail: (payload) => request("/api/auth/verify-email/", { method: "POST", json: payload }),
  resendVerification: (payload = {}) =>
    request("/api/auth/resend-verification/", { method: "POST", json: payload }),
  forgotPassword: (payload) => request("/api/auth/forgot-password/", { method: "POST", json: payload }),
  resetPassword: (payload) => request("/api/auth/reset-password/", { method: "POST", json: payload }),
  changePassword: (payload) => request("/api/auth/change-password/", { method: "POST", json: payload }),
  account: () => request("/api/auth/account/"),
  deleteAccount: (payload) => request("/api/auth/account/delete/", { method: "POST", json: payload }),

  /* Workspace data endpoints (cookie session auth; `auth` arg kept for compatibility) */
  loadWorkspace: (_auth) => request("/api/workspace/"),
  dashboard: (_auth) => request("/api/dashboard/"),

  listMembers: (_auth, params = "") => request(`/api/members/${params}`),
  getMember: (_auth, id) => request(`/api/members/${id}/`),
  createMember: (_auth, formData) => request("/api/members/", { method: "POST", formData }),
  updateMember: (_auth, id, formData) =>
    request(`/api/members/${id}/`, { method: "PATCH", formData }),
  archiveMember: (_auth, id) => request(`/api/members/${id}/archive/`, { method: "POST" }),
  listGroups: (_auth, params = "") => request(`/api/groups/${params}`),
  getGroup: (_auth, id) => request(`/api/groups/${id}/`),
  createGroup: (_auth, json) => request("/api/groups/", { method: "POST", json }),
  updateGroup: (_auth, id, json) => request(`/api/groups/${id}/`, { method: "PATCH", json }),
  archiveGroup: (_auth, id) => request(`/api/groups/${id}/`, { method: "DELETE" }),
  listMemberships: (_auth, groupId) => request(`/api/groups/${groupId}/memberships/`),
  createMembership: (_auth, groupId, formData) =>
    request(`/api/groups/${groupId}/memberships/`, { method: "POST", formData }),
  updateMembership: (_auth, groupId, membershipId, formData) =>
    request(`/api/groups/${groupId}/memberships/${membershipId}/`, { method: "PATCH", formData }),
  removeMembership: (_auth, groupId, membershipId) =>
    request(`/api/groups/${groupId}/memberships/${membershipId}/`, { method: "DELETE" }),
  listParticipants: (_auth, groupId) => request(`/api/groups/${groupId}/participants/`),
  createParticipant: (_auth, groupId, formData) =>
    request(`/api/groups/${groupId}/participants/`, { method: "POST", formData }),
  updateParticipant: (_auth, groupId, participantId, formData) =>
    request(`/api/groups/${groupId}/participants/${participantId}/`, { method: "PATCH", formData }),
  removeParticipant: (_auth, groupId, participantId) =>
    request(`/api/groups/${groupId}/participants/${participantId}/`, { method: "DELETE" }),
  listAvailableMembers: (_auth, groupId) => request(`/api/groups/${groupId}/available-members/`),
  getGroupKioskStart: (_auth, groupId) => request(`/api/groups/${groupId}/kiosk/`),
  identifyKiosk: (_auth, groupId, payload) =>
    request(`/api/groups/${groupId}/kiosk/identify/`, { method: "POST", json: payload }),
  performKioskAction: (_auth, groupId, payload) =>
    request(`/api/groups/${groupId}/kiosk/perform/`, { method: "POST", json: payload }),
  listHistory: (_auth, params = "") => request(`/api/history/${params}`),

  /* Workspace staff/admin management (owner-only) */
  listWorkspaceStaff: (_auth) => request("/api/workspace-staff/"),
  createWorkspaceStaff: (_auth, json) =>
    request("/api/workspace-staff/", { method: "POST", json }),
  updateWorkspaceStaff: (_auth, staffId, json) =>
    request(`/api/workspace-staff/${staffId}/`, { method: "PATCH", json }),
  resetWorkspaceStaffPassword: (_auth, staffId, json) =>
    request(`/api/workspace-staff/${staffId}/reset-password/`, { method: "POST", json }),
};

export function errorMessage(error) {
  if (!error) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  const data = error.data;
  if (!data) {
    return error.message || "Something went wrong.";
  }
  if (typeof data.detail === "string") {
    return data.detail;
  }
  if (Array.isArray(data.detail)) {
    return data.detail.join(" ");
  }
  // DRF serializer validation errors often come as:
  // { "field": ["message", ...], ... }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (typeof data.code === "string" && typeof data.detail === "string") {
      return data.detail;
    }
    const values = Object.values(data);
    for (const value of values) {
      if (Array.isArray(value) && value.length && typeof value[0] === "string") {
        return value[0];
      }
      if (typeof value === "string") {
        return value;
      }
    }
  }
  if (data.name) {
    return Array.isArray(data.name) ? data.name.join(" ") : String(data.name);
  }
  return "Something went wrong.";
}
