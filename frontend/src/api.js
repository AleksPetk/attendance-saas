const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";

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

async function request(path, { method = "GET", json, formData, cache } = {}) {
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
    ...(cache ? { cache } : {}),
  });
  if (response.status === 204) {
    return { ok: true, status: 204, data: null };
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  return { ok: true, status: response.status, data: await response.json() };
}

function filenameFromContentDisposition(headerValue) {
  if (!headerValue) return "";
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utfMatch) {
    try {
      return decodeURIComponent(utfMatch[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return utfMatch[1].trim().replace(/^"|"$/g, "");
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(headerValue);
  return plainMatch ? plainMatch[1].trim() : "";
}

async function requestBlob(path, { method = "GET" } = {}) {
  const headers = {};
  const m = method.toUpperCase();
  if (shouldAttachCsrf(m)) {
    const csrf = getCookie("checkstation_csrftoken");
    if (csrf) {
      headers["X-CSRFToken"] = csrf;
    }
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: m,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const blob = await response.blob();
  const filename = filenameFromContentDisposition(response.headers.get("Content-Disposition"));
  return { ok: true, status: response.status, blob, filename };
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
  exitKiosk: (payload) => request("/api/kiosk/exit/", { method: "POST", json: payload }),
  verifyEmail: (payload) => request("/api/auth/verify-email/", { method: "POST", json: payload }),
  resendVerification: (payload = {}) =>
    request("/api/auth/resend-verification/", { method: "POST", json: payload }),
  forgotPassword: (payload) => request("/api/auth/forgot-password/", { method: "POST", json: payload }),
  resetPassword: (payload) => request("/api/auth/reset-password/", { method: "POST", json: payload }),
  changePassword: (payload) => request("/api/auth/change-password/", { method: "POST", json: payload }),
  setPassword: (payload) => request("/api/auth/set-password/", { method: "POST", json: payload }),
  unlinkGoogle: (payload) => request("/api/auth/google/unlink/", { method: "POST", json: payload }),
  unlinkApple: (payload) => request("/api/auth/apple/unlink/", { method: "POST", json: payload }),
  account: () => request("/api/auth/account/"),
  deleteAccount: (payload) => request("/api/auth/account/delete/", { method: "POST", json: payload }),
  requestBackupEmail: (payload) =>
    request("/api/auth/account/backup-email/", { method: "POST", json: payload }),
  removeBackupEmail: (payload) =>
    request("/api/auth/account/backup-email/remove/", { method: "POST", json: payload }),
  resendBackupEmailVerification: () =>
    request("/api/auth/account/backup-email/resend/", { method: "POST", json: {} }),
  cancelBackupEmailChange: () =>
    request("/api/auth/account/backup-email/cancel/", { method: "POST", json: {} }),
  verifyBackupEmail: (payload) =>
    request("/api/auth/verify-backup-email/", { method: "POST", json: payload }),
  requestPrimaryEmailChange: (payload) =>
    request("/api/auth/account/primary-email/", { method: "POST", json: payload }),
  resendPrimaryEmailChange: () =>
    request("/api/auth/account/primary-email/resend/", { method: "POST", json: {} }),
  cancelPrimaryEmailChange: () =>
    request("/api/auth/account/primary-email/cancel/", { method: "POST", json: {} }),
  verifyPrimaryEmail: (payload) =>
    request("/api/auth/verify-primary-email/", { method: "POST", json: payload }),

  /* Owner (customer) TOTP 2FA */
  owner2faStartSetup: (payload) =>
    request("/api/auth/owner-2fa/setup/", { method: "POST", json: payload }),
  owner2faVerifySetup: (payload) =>
    request("/api/auth/owner-2fa/setup/verify/", { method: "POST", json: payload }),
  owner2faChallenge: (payload) =>
    request("/api/auth/owner-2fa/challenge/", { method: "POST", json: payload }),
  owner2faRegenerateRecoveryCodes: (payload) =>
    request("/api/auth/owner-2fa/recovery-codes/regenerate/", { method: "POST", json: payload }),
  owner2faDisable: (payload) =>
    request("/api/auth/owner-2fa/disable/", { method: "POST", json: payload }),

  /* Workspace data endpoints (cookie session auth; `auth` arg kept for compatibility) */
  loadWorkspace: (_auth) => request("/api/workspace/"),
  getTutorialState: () => request("/api/tutorial/state/"),
  updateTutorialState: (payload) =>
    request("/api/tutorial/state/", { method: "PATCH", json: payload }),
  completeTutorialModule: (moduleId) =>
    request(`/api/tutorial/modules/${encodeURIComponent(moduleId)}/complete/`, {
      method: "POST",
      json: {},
    }),
  listAnnouncements: () =>
    request("/api/announcements/", { cache: "no-store" }),
  markAnnouncementRead: (id) =>
    request(`/api/announcements/${id}/read/`, { method: "POST", json: {} }),
  markAnnouncementsRead: () =>
    request("/api/announcements/mark-read/", { method: "POST", json: {} }),
  dashboard: (_auth) => request("/api/dashboard/"),
  getPlanLockSelection: (_auth, kind) =>
    request(`/api/plan-locks/selection/?kind=${encodeURIComponent(kind)}`),
  putPlanLockSelection: (_auth, { kind, selected_ids }) =>
    request("/api/plan-locks/selection/", {
      method: "PUT",
      json: { kind, selected_ids },
    }),

  listMembers: (_auth, params = "") => request(`/api/members/${params}`),
  getMember: (_auth, id) => request(`/api/members/${id}/`),
  createMember: (_auth, formData) => request("/api/members/", { method: "POST", formData }),
  updateMember: (_auth, id, formData) =>
    request(`/api/members/${id}/`, { method: "PATCH", formData }),
  archiveMember: (_auth, id) => request(`/api/members/${id}/archive/`, { method: "POST" }),
  restoreMember: (_auth, id) => request(`/api/members/${id}/restore/`, { method: "POST" }),
  permanentlyDeleteMember: (_auth, id) =>
    request(`/api/members/${id}/permanently-delete/`, { method: "POST" }),
  listGroups: (_auth, params = "") => request(`/api/groups/${params}`),
  getGroup: (_auth, id) => request(`/api/groups/${id}/`),
  createGroup: (_auth, json) => request("/api/groups/", { method: "POST", json }),
  updateGroup: (_auth, id, json) => request(`/api/groups/${id}/`, { method: "PATCH", json }),
  getGroupEmailSender: (_auth, groupId) =>
    request(`/api/groups/${groupId}/email-sender/`),
  updateGroupEmailSender: (_auth, groupId, json) =>
    request(`/api/groups/${groupId}/email-sender/`, { method: "PUT", json }),
  testGroupEmailSender: (_auth, groupId, json) =>
    request(`/api/groups/${groupId}/email-sender/test/`, { method: "POST", json }),
  archiveGroup: (_auth, id) => request(`/api/groups/${id}/`, { method: "DELETE" }),
  restoreGroup: (_auth, id) => request(`/api/groups/${id}/restore/`, { method: "POST" }),
  permanentlyDeleteGroup: (_auth, id) =>
    request(`/api/groups/${id}/permanently-delete/`, { method: "POST" }),
  listMemberships: (_auth, groupId, classId) =>
    request(
      classId
        ? `/api/groups/${groupId}/classes/${classId}/memberships/`
        : `/api/groups/${groupId}/memberships/`,
    ),
  createMembership: (_auth, groupId, formData, classId) =>
    request(
      classId
        ? `/api/groups/${groupId}/classes/${classId}/memberships/`
        : `/api/groups/${groupId}/memberships/`,
      { method: "POST", formData },
    ),
  updateMembership: (_auth, groupId, membershipId, formData, classId) =>
    request(
      classId
        ? `/api/groups/${groupId}/classes/${classId}/memberships/${membershipId}/`
        : `/api/groups/${groupId}/memberships/${membershipId}/`,
      { method: "PATCH", formData },
    ),
  removeMembership: (_auth, groupId, membershipId, classId) =>
    request(
      classId
        ? `/api/groups/${groupId}/classes/${classId}/memberships/${membershipId}/`
        : `/api/groups/${groupId}/memberships/${membershipId}/`,
      { method: "DELETE" },
    ),
  listParticipants: (_auth, groupId, classId) =>
    request(
      classId
        ? `/api/groups/${groupId}/classes/${classId}/participants/`
        : `/api/groups/${groupId}/participants/`,
    ),
  createParticipant: (_auth, groupId, formData, classId) =>
    request(
      classId
        ? `/api/groups/${groupId}/classes/${classId}/participants/`
        : `/api/groups/${groupId}/participants/`,
      { method: "POST", formData },
    ),
  updateParticipant: (_auth, groupId, participantId, formData, classId) =>
    request(
      classId
        ? `/api/groups/${groupId}/classes/${classId}/participants/${participantId}/`
        : `/api/groups/${groupId}/participants/${participantId}/`,
      { method: "PATCH", formData },
    ),
  removeParticipant: (_auth, groupId, participantId, classId) =>
    request(
      classId
        ? `/api/groups/${groupId}/classes/${classId}/participants/${participantId}/`
        : `/api/groups/${groupId}/participants/${participantId}/`,
      { method: "DELETE" },
    ),
  listAvailableMembers: (_auth, groupId, classId) =>
    request(
      classId
        ? `/api/groups/${groupId}/classes/${classId}/available-members/`
        : `/api/groups/${groupId}/available-members/`,
    ),
  listGroupClasses: (_auth, groupId, params = "") =>
    request(`/api/groups/${groupId}/classes/${params}`),
  getGroupClass: (_auth, groupId, classId) =>
    request(`/api/groups/${groupId}/classes/${classId}/`),
  createGroupClass: (_auth, groupId, json) =>
    request(`/api/groups/${groupId}/classes/`, { method: "POST", json }),
  listGroupClassImportSources: (_auth, groupId) =>
    request(`/api/groups/${groupId}/classes/import-sources/`),
  importStandardGroupAsClass: (_auth, groupId, json) =>
    request(`/api/groups/${groupId}/classes/import-standard-group/`, {
      method: "POST",
      json,
    }),
  updateGroupClass: (_auth, groupId, classId, json) =>
    request(`/api/groups/${groupId}/classes/${classId}/`, { method: "PATCH", json }),
  archiveGroupClass: (_auth, groupId, classId) =>
    request(`/api/groups/${groupId}/classes/${classId}/`, { method: "DELETE" }),
  restoreGroupClass: (_auth, groupId, classId) =>
    request(`/api/groups/${groupId}/classes/${classId}/restore/`, { method: "POST" }),
  permanentlyDeleteGroupClass: (_auth, groupId, classId) =>
    request(`/api/groups/${groupId}/classes/${classId}/permanently-delete/`, {
      method: "POST",
    }),
  getGroupKioskStart: (_auth, groupId) => request(`/api/groups/${groupId}/kiosk/`),
  getGroupKioskClassPeople: (_auth, groupId, classId, params = {}) => {
    const query = new URLSearchParams();
    if (params.pin) {
      query.set("pin", params.pin);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request(`/api/groups/${groupId}/kiosk/classes/${classId}/people/${suffix}`);
  },
  verifyGroupKioskClassPin: (_auth, groupId, classId, json) =>
    request(`/api/groups/${groupId}/kiosk/classes/${classId}/verify-pin/`, {
      method: "POST",
      json,
    }),
  getGroupKioskSettings: (_auth, groupId) => request(`/api/groups/${groupId}/kiosk-settings/`),
  updateGroupKioskSettings: (_auth, groupId, json) =>
    request(`/api/groups/${groupId}/kiosk-settings/`, { method: "PATCH", json }),
  resetKioskAttendanceNow: (_auth, groupId) =>
    request(`/api/groups/${groupId}/kiosk-settings/reset-now/`, { method: "POST" }),
  getGroupKioskDesign: (_auth, groupId) => request(`/api/groups/${groupId}/kiosk-design/`),
  updateGroupKioskDesign: (_auth, groupId, formData) =>
    request(`/api/groups/${groupId}/kiosk-design/`, { method: "PUT", formData }),
  listKioskPresets: (_auth) => request("/api/kiosk-presets/"),
  enterKiosk: (_auth, groupId) =>
    request(`/api/groups/${groupId}/kiosk/`, { method: "POST" }),
  identifyKiosk: (_auth, groupId, payload) =>
    request(`/api/groups/${groupId}/kiosk/identify/`, { method: "POST", json: payload }),
  performKioskAction: (_auth, groupId, payload) =>
    request(`/api/groups/${groupId}/kiosk/perform/`, { method: "POST", json: payload }),
  listHistory: (_auth, params = "") => request(`/api/history/${params}`),
  listHistoryReportGroups: (_auth) => request("/api/history/report-groups/"),
  getAttendanceReportOptions: (_auth, params = "") =>
    request(`/api/history/attendance-report/options/${params}`),
  getAttendanceReport: (_auth, params = "") =>
    request(`/api/history/attendance-report/${params}`),
  exportAttendanceReport: (_auth, params = "") =>
    requestBlob(`/api/history/attendance-report/export/${params}`),

  /* Owner billing (Stripe Checkout / portal). Secrets never leave the server. */
  getBilling: () => request("/api/billing/"),
  getBillingCatalog: () => request("/api/billing/catalog/"),
  getContactCategories: () => request("/api/contact/categories/"),
  getContactSuggestions: (category, subcategory) =>
    request(
      `/api/contact/suggestions/?category=${encodeURIComponent(category)}&subcategory=${encodeURIComponent(subcategory)}`,
    ),
  submitContact: (payload) => request("/api/contact/", { method: "POST", json: payload }),

  /* Canonical published documentation/help content. */
  listContentDocuments: () => request("/api/content/documents/"),
  getContentDocument: (slug) =>
    request(`/api/content/documents/${encodeURIComponent(slug)}/`),
  listContentFaq: ({ category = "", q = "" } = {}) => {
    const query = new URLSearchParams();
    if (category) query.set("category", category);
    if (q) query.set("q", q);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request(`/api/content/faq/${suffix}`);
  },

  startBillingCheckout: (json) =>
    request("/api/billing/checkout/", { method: "POST", json }),
  previewBillingUpgrade: (json = {}) =>
    request("/api/billing/upgrade/preview/", { method: "POST", json }),
  applyBillingUpgrade: (json = {}) =>
    request("/api/billing/upgrade/", { method: "POST", json }),
  scheduleBillingDowngrade: (json = {}) =>
    request("/api/billing/downgrade/", { method: "POST", json }),
  cancelBillingSubscription: (json = {}) =>
    request("/api/billing/cancel/", { method: "POST", json }),
  resumeBillingSubscription: (json = {}) =>
    request("/api/billing/resume/", { method: "POST", json }),
  cancelScheduledBillingDowngrade: (json = {}) =>
    request("/api/billing/downgrade/cancel/", { method: "POST", json }),
  scheduleBillingChange: (json) =>
    request("/api/billing/change/schedule/", { method: "POST", json }),
  openBillingPortal: (json = {}) =>
    request("/api/billing/portal/", { method: "POST", json }),
  listBillingInvoices: () => request("/api/billing/invoices/"),

  /* Workspace staff/admin management (owner-only) */
  listWorkspaceStaff: (_auth) => request("/api/workspace-staff/"),
  createWorkspaceStaff: (_auth, json) =>
    request("/api/workspace-staff/", { method: "POST", json }),
  updateWorkspaceStaff: (_auth, staffId, json) =>
    request(`/api/workspace-staff/${staffId}/`, { method: "PATCH", json }),
  deleteWorkspaceStaff: (_auth, staffId) =>
    request(`/api/workspace-staff/${staffId}/`, { method: "DELETE" }),
  resetWorkspaceStaffPassword: (_auth, staffId, json) =>
    request(`/api/workspace-staff/${staffId}/reset-password/`, { method: "POST", json }),
  getWorkspaceStaffGroupAccess: (_auth, staffId) =>
    request(`/api/workspace-staff/${staffId}/group-access/`),
  setWorkspaceStaffGroupAccess: (_auth, staffId, json) =>
    request(`/api/workspace-staff/${staffId}/group-access/`, { method: "PUT", json }),
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
