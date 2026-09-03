import { Link } from "react-router-dom";

import { resolvePromoHandoffUrl } from "./siteOrigins.js";

/**
 * Promo marketing navigation that hard-navigates to the public site when the
 * browser is on the workspace host (SPA Links must not keep promo URLs there).
 */
export default function PromoHostLink({ to, children, ...rest }) {
  const target = resolvePromoHandoffUrl(
    to,
    typeof window !== "undefined" ? window.location.origin : "",
  );
  if (/^https?:\/\//i.test(target)) {
    return (
      <a href={target} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} {...rest}>
      {children}
    </Link>
  );
}
