/** Visible MAS plan amounts must come only from StoreKit localized displayPrice. */

export function storeKitDisplayPriceOnly(product: {
  displayPrice?: unknown;
  price?: unknown;
}): string {
  if (typeof product.displayPrice !== "string") return "";
  return product.displayPrice.trim();
}
