export type KioskSettingsReadiness = {
  ready: boolean;
  issues: string[];
  exit_code_configured?: boolean;
};

export type GroupLaunchReadiness = {
  setup_complete?: boolean;
  missing_class_pin_count?: number;
  launchable_class_count?: number;
  missing_pin_count?: number;
  missing_email_count?: number;
};

export function kioskSettingsReadiness(value: unknown): KioskSettingsReadiness | null {
  if (!value || typeof value !== "object") return null;
  const readiness = (value as { readiness?: unknown }).readiness;
  if (!readiness || typeof readiness !== "object") return null;
  const record = readiness as Record<string, unknown>;
  return {
    ready: record.ready === true,
    issues: Array.isArray(record.issues)
      ? record.issues.filter((issue): issue is string => typeof issue === "string" && issue.trim().length > 0)
      : [],
    exit_code_configured: typeof record.exit_code_configured === "boolean" ? record.exit_code_configured : undefined,
  };
}

export function groupLaunchIssueKeys(readiness?: GroupLaunchReadiness | null) {
  if (!readiness || readiness.setup_complete !== false) return [];
  const issues: Array<{ key: string; count?: number }> = [];
  if (readiness.missing_class_pin_count) issues.push({ key: "groups.readinessMissingClassPin", count: readiness.missing_class_pin_count });
  if (typeof readiness.launchable_class_count === "number" && readiness.launchable_class_count === 0) issues.push({ key: "groups.readinessNoLaunchableClass" });
  if (readiness.missing_pin_count) issues.push({ key: "groups.readinessMissingPin", count: readiness.missing_pin_count });
  if (readiness.missing_email_count) issues.push({ key: "groups.readinessMissingEmail", count: readiness.missing_email_count });
  return issues.length ? issues : [{ key: "groups.setupIncomplete" }];
}

export function isKioskLaunchBlocked({
  groupReadiness,
  canInspectKioskSettings,
  settingsLoading,
  kioskReadiness,
}: {
  groupReadiness?: GroupLaunchReadiness | null;
  canInspectKioskSettings: boolean;
  settingsLoading: boolean;
  kioskReadiness: KioskSettingsReadiness | null;
}) {
  if (groupReadiness?.setup_complete === false) return true;
  if (!canInspectKioskSettings) return false;
  return settingsLoading || kioskReadiness?.ready !== true;
}
