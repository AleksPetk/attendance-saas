export type ReportMode = "group" | "member";
export type DatePreset = "today" | "this_week" | "this_month" | "custom";
export type ExportFormat = "pdf" | "xlsx" | "csv";

export type ReportGroup = {
  source_group_id: number;
  name: string;
  status: "active" | "archived" | "deleted" | string;
  group_type: string;
};

export type ReportMember = { id: number; name: string; status: string };
export type ReportParticipant = {
  kind: "member" | "group_only_participant";
  id: number;
  name: string;
  participant_code: string;
};

export type ReportOptions = {
  groups: ReportGroup[];
  members: ReportMember[];
  member_groups?: ReportGroup[];
  participants?: ReportParticipant[];
};

export type AttendanceReport = {
  report_by: ReportMode;
  member_id: number | null;
  member_name: string;
  member_status: string;
  participant: ReportParticipant | null;
  group_name: string;
  group_status: string;
  group_type: string;
  source_group_id: number | null;
  show_group_column: boolean;
  show_class_column: boolean;
  date_preset: DatePreset;
  date_from: string;
  date_to: string;
  date_label: string;
  columns: { key: string; label: string }[];
  sections: {
    date: string;
    label: string;
    rows: {
      participant_key: string;
      name: string;
      group_name?: string;
      class_name?: string;
      cells: Record<string, string | null | undefined>;
    }[];
  }[];
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= days;
}

export function validCustomRange(from: string, to: string): boolean {
  return isValidIsoDate(from) && isValidIsoDate(to) && from <= to;
}

export function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function reportTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || "";
  } catch {
    return "";
  }
}

export function reportQuery({
  mode,
  groupId,
  memberId,
  participant,
  preset,
  dateFrom,
  dateTo,
  exportFormat,
}: {
  mode: ReportMode;
  groupId: string;
  memberId: string;
  participant: string;
  preset: DatePreset | "";
  dateFrom: string;
  dateTo: string;
  exportFormat?: ExportFormat;
}): string {
  const params = new URLSearchParams({ report_by: mode, preset });
  if (mode === "member") {
    params.set("member_id", memberId);
    if (groupId) params.set("source_group_id", groupId);
  } else {
    params.set("source_group_id", groupId);
    const [kind, id] = participant.split(":");
    if (["member", "group_only_participant"].includes(kind) && /^\d+$/.test(id || "")) {
      params.set("participant_kind", kind);
      params.set("participant_id", id);
    }
  }
  const timezone = reportTimezone();
  if (timezone) params.set("timezone", timezone);
  if (preset === "custom") {
    params.set("date_from", dateFrom);
    params.set("date_to", dateTo);
  }
  if (exportFormat) params.set("export_format", exportFormat);
  return params.toString();
}

export function exportFilename(header: string | null, format: ExportFormat): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = header?.match(/filename="([^"]+)"/i)?.[1];
  const plain = header?.match(/filename=([^;]+)/i)?.[1]?.trim();
  let candidate = encoded ? decodeURIComponent(encoded) : quoted || plain || `attendance-report.${format}`;
  candidate = candidate.replace(/[\\/\0]/g, "-").trim();
  return candidate || `attendance-report.${format}`;
}

export const EXPORT_DETAILS: Record<ExportFormat, { mimeType: string; uti: string }> = {
  pdf: { mimeType: "application/pdf", uti: "com.adobe.pdf" },
  xlsx: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", uti: "org.openxmlformats.spreadsheetml.sheet" },
  csv: { mimeType: "text/csv", uti: "public.comma-separated-values-text" },
};
