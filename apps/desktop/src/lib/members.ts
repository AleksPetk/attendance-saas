export type MemberProfileFilter = "all" | "with_email" | "without_email" | "with_phone" | "without_phone";
export type MemberSortOrder = "newest" | "oldest" | "name_asc" | "name_desc";

type FilterableMember = { name?: string; email?: string; phone?: string; created_at?: string };

export function filterAndSortMembers<T extends FilterableMember>(members: T[], filters: { profile: MemberProfileFilter; sort: MemberSortOrder }) {
  const filtered = members.filter((member) => {
    if (filters.profile === "with_email") return hasValue(member.email);
    if (filters.profile === "without_email") return !hasValue(member.email);
    if (filters.profile === "with_phone") return hasValue(member.phone);
    if (filters.profile === "without_phone") return !hasValue(member.phone);
    return true;
  });
  return filtered.sort((left, right) => {
    if (filters.sort === "oldest") return createdAt(left) - createdAt(right) || byName(left, right);
    if (filters.sort === "name_asc") return byName(left, right);
    if (filters.sort === "name_desc") return byName(right, left);
    return createdAt(right) - createdAt(left) || byName(left, right);
  });
}

export function memberUsageMetrics(count: number | null | undefined, limit: number | null | undefined, options: { unlimited: boolean }) {
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  const normalizedCount = Math.max(0, count);
  if (options.unlimited) return { count: normalizedCount, limit: null, remaining: null, percentage: null, unlimited: true };
  if (typeof limit !== "number" || !Number.isFinite(limit)) return null;
  const normalizedLimit = Math.max(0, limit);
  const percentage = normalizedLimit === 0 ? (normalizedCount > 0 ? 100 : 0) : Math.min(100, (normalizedCount / normalizedLimit) * 100);
  return { count: normalizedCount, limit: normalizedLimit, remaining: Math.max(0, normalizedLimit - normalizedCount), percentage, unlimited: false };
}

function hasValue(value?: string) { return Boolean(String(value || "").trim()); }
function createdAt(member: FilterableMember) { const value = Date.parse(member.created_at || ""); return Number.isFinite(value) ? value : 0; }
function byName(left: FilterableMember, right: FilterableMember) { return String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base", numeric: true }); }
