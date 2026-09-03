import i18n from "./i18n/index.js";
import { formatDate } from "./i18n/format.js";

export function emptyMemberValues() {
  return {
    name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    address: "",
    notes: "",
    photo: null,
    clear_photo: false,
  };
}

export function valuesFromMember(member) {
  return {
    ...emptyMemberValues(),
    name: member.name || "",
    email: member.email || "",
    phone: member.phone || "",
    date_of_birth: member.date_of_birth || "",
    address: member.address || "",
    notes: member.notes || "",
  };
}

export function buildMemberFormData(values, { includeEmptyDate = false } = {}) {
  const data = new FormData();
  data.append("name", (values.name || "").trim());
  data.append("email", (values.email || "").trim());
  data.append("phone", (values.phone || "").trim());
  data.append("address", (values.address || "").trim());
  data.append("notes", (values.notes || "").trim());
  if (values.date_of_birth) {
    data.append("date_of_birth", values.date_of_birth);
  } else if (includeEmptyDate) {
    data.append("date_of_birth", "");
  }
  if (values.photo) {
    data.append("photo", values.photo);
  }
  if (values.clear_photo) {
    data.append("clear_photo", "true");
  }
  return data;
}

export function displayText(value) {
  const text = (value || "").trim();
  return text || i18n.t("members:form.emptyValue");
}

export function formatMemberDate(isoDate) {
  if (!isoDate) {
    return i18n.t("members:form.emptyValue");
  }
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return formatDate(date, i18n.language, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatMemberId(id) {
  if (id == null || id === "") {
    return "";
  }
  return i18n.t("members:form.memberId", { id });
}

export function memberSecondaryLine(member, { includeId = true } = {}) {
  const parts = [];
  if (includeId) {
    const memberId = formatMemberId(member.id);
    if (memberId) {
      parts.push(memberId);
    }
  }
  if (member.email) {
    parts.push(member.email);
  }
  if (member.phone) {
    parts.push(member.phone);
  }
  return parts;
}
