/**
 * Trusted server geo bootstrap (no IPs). Used only for first-visit locale
 * defaults — never for billing market selection on the client.
 */

let geoPromise = null;

export function fetchPublicGeo(apiGetGeo) {
  if (!geoPromise) {
    geoPromise = Promise.resolve()
      .then(() => apiGetGeo())
      .then((result) => {
        const data = result?.data || result || {};
        return {
          country_code: String(data.country_code || ""),
          billing_market: String(data.billing_market || "global"),
          default_locale: data.default_locale === "ja" ? "ja" : "en",
        };
      })
      .catch(() => ({
        country_code: "",
        billing_market: "global",
        default_locale: "en",
      }));
  }
  return geoPromise;
}

export function resetPublicGeoCacheForTests() {
  geoPromise = null;
}
