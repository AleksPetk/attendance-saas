/**
 * Derive built-in Business trial offer display from the billing catalog.
 * Public surfaces must not hardcode trial availability independently.
 */

export function builtinTrialOfferFromCatalog(catalog) {
  const days = Number(catalog?.builtin_trial_days);
  const offered =
    Boolean(catalog?.builtin_trial_offered) && Number.isFinite(days) && days > 0;
  return {
    offered,
    days: offered ? days : 0,
  };
}
