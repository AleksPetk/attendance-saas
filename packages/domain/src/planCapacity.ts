/** Desktop reads the same workspace entitlement snapshot the browser uses. Limits come from that payload. */

export const ACTIVE_STANDARD_GROUPS = "active_standard_groups";
export const ARCHIVED_GROUPS = "archived_groups";
export const MEMBERS = "members";

export type PlanLockRecord = {
  is_plan_locked?: boolean;
  plan_unlocked?: boolean;
};

export function isPlanLocked(record: PlanLockRecord | null | undefined): boolean {
  return Boolean(record?.is_plan_locked || record?.plan_unlocked === false);
}

export function partitionByPlanLock<T extends PlanLockRecord>(rows: T[]) {
  const available: T[] = [];
  const locked: T[] = [];
  for (const row of rows) {
    if (isPlanLocked(row)) locked.push(row);
    else available.push(row);
  }
  return { available, locked };
}

export function requiredPlanSelectionCount(limit: number, candidateCount: number) {
  return Math.min(Math.max(0, Number(limit) || 0), Math.max(0, Number(candidateCount) || 0));
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

export function groupCapacityNotice(
  t: Translator,
  { archived, planName, limit }: { archived: boolean; planName: string; limit: number | null },
) {
  if (typeof limit !== "number") return t("groups.planSelection.noticeGeneric");
  const key = archived
    ? limit === 1
      ? "groups.planSelection.noticeArchived"
      : "groups.planSelection.noticeArchivedPlural"
    : limit === 1
      ? "groups.planSelection.noticeStandard"
      : "groups.planSelection.noticeStandardPlural";
  return t(key, { planName, limit });
}

export function memberCapacityNotice(
  t: Translator,
  { planName, limit }: { planName: string; limit: number | null },
) {
  if (typeof limit !== "number") return t("members.planSelection.noticeGeneric");
  return t(limit === 1 ? "members.planSelection.notice" : "members.planSelection.noticePlural", { planName, limit });
}

export function isPlanResourceLocked(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? error.status : undefined;
  const data = "data" in error ? error.data : undefined;
  const code = data && typeof data === "object" && "code" in data ? data.code : undefined;
  return status === 403 && code === "plan_resource_locked";
}
