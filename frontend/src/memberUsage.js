export function memberUsageMetrics(count, limit, { unlimited = false } = {}) {
  if (!Number.isFinite(count)) return null;

  const normalizedCount = Math.max(0, count);
  if (unlimited) {
    return {
      count: normalizedCount,
      unlimited: true,
      limit: null,
      remaining: null,
      percentage: null,
    };
  }

  if (!Number.isFinite(limit)) return null;

  const normalizedLimit = Math.max(0, limit);
  const percentage =
    normalizedLimit === 0
      ? normalizedCount > 0
        ? 100
        : 0
      : Math.min(100, (normalizedCount / normalizedLimit) * 100);

  return {
    count: normalizedCount,
    unlimited: false,
    limit: normalizedLimit,
    remaining: Math.max(0, normalizedLimit - normalizedCount),
    percentage,
  };
}
