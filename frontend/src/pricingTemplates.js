export const DEFAULT_PRICING_TEMPLATE = "normal";

const PRICING_TEMPLATES = new Set([
  DEFAULT_PRICING_TEMPLATE,
  "spring",
  "summer",
  "autumn",
  "winter",
  "halloween",
  "christmas_new_year",
  "black_friday",
]);

export function pricingTemplateKey(catalog) {
  const candidate =
    typeof catalog?.pricing_template === "string"
      ? catalog.pricing_template
      : catalog?.pricing_template?.key;
  return PRICING_TEMPLATES.has(candidate) ? candidate : DEFAULT_PRICING_TEMPLATE;
}

export function pricingTemplateClass(catalog) {
  return `pricing-template-${pricingTemplateKey(catalog)}`;
}
