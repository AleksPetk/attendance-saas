/** Open Stripe-hosted pages without navigating away from Check Station. */

export function externalLinkProps(url) {
  return {
    href: url,
    target: "_blank",
    rel: "noopener noreferrer",
  };
}

/**
 * Popup-blocker-safe portal open: blank tab is created synchronously on click,
 * then the Stripe portal URL is assigned after the backend responds.
 */
export async function openStripePortalSafely(fetchPortalUrl) {
  const tab = window.open("about:blank", "_blank");
  if (!tab) {
    throw new Error("Your browser blocked the billing portal tab. Allow pop-ups and try again.");
  }
  try {
    const url = await fetchPortalUrl();
    if (!url) {
      throw new Error("Portal URL was not returned.");
    }
    tab.location.href = url;
    tab.opener = null;
  } catch (error) {
    if (!tab.closed) {
      tab.close();
    }
    throw error;
  }
}
