import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api.js";
import PublicPageShell from "./PublicPageShell.jsx";
import {
  catalogPromotion,
  isAcquisitionPromotion,
  promotionCheckoutWarning,
  promotionPriceLabel,
  promotionPriceNote,
} from "./promotionCatalog.js";

function PageTitle({ title, description }) {
  useEffect(() => {
    document.title = title;
    let el = document.querySelector('meta[name="description"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "description");
      document.head.appendChild(el);
    }
    el.setAttribute("content", description);
  }, [title, description]);
  return null;
}

const FALLBACK_CATALOG = {
  currency: "usd",
  basic: { key: "basic", display_name: "Basic", formatted: "Free" },
  plans: {
    plus: {
      key: "plus",
      display_name: "Plus",
      intervals: {
        monthly: {
          interval: "monthly",
          cents: 999,
          formatted: "$9.99",
          promotion: { active: false },
        },
        yearly: {
          interval: "yearly",
          cents: 9990,
          formatted: "$99.90",
          promotion: { active: false },
        },
      },
    },
    business: {
      key: "business",
      display_name: "Business",
      intervals: {
        monthly: {
          interval: "monthly",
          cents: 1499,
          formatted: "$14.99",
          promotion: { active: false },
        },
        yearly: {
          interval: "yearly",
          cents: 14990,
          formatted: "$149.90",
          promotion: { active: false },
        },
      },
    },
  },
  promotion: {
    audience: "public",
    group: "new_basic",
    eligible: true,
    active: false,
    mode: "off",
    label: "New / Basic",
    summary: "No active promotional pricing for public / Basic",
    checkout_applies_promotion: false,
    offers: [],
  },
  trial_available: false,
};

const FEATURES = {
  basic: [
    "2 active Groups",
    "10 Members",
    "Kiosk check-in",
    "Action history",
    "Ads supported",
  ],
  plus: [
    "Everything in Basic",
    "10 active Groups / 50 Members",
    "Workspace Staff management",
    "Attendance Report export",
    "Group Forward Emails",
    "No ads",
  ],
  business: [
    "Everything in Plus",
    "Structured Groups",
    "Higher Group / Member limits",
    "More Admin and Staff seats",
    "Structured snapshot import",
  ],
};

export default function PublicPricingScreen({ session = null }) {
  const [interval, setInterval] = useState("monthly");
  const [catalog, setCatalog] = useState(FALLBACK_CATALOG);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await api.getBillingCatalog();
        if (!cancelled && result?.data) {
          setCatalog({ ...FALLBACK_CATALOG, ...result.data });
        }
      } catch {
        /* keep frozen fallback catalog */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const signedIn = Boolean(session?.workspace);
  const ctaTo = signedIn ? "/account/subscription" : "/register";
  const ctaLabel = signedIn ? "Manage subscription" : "Create free workspace";
  const promo = catalogPromotion(catalog);
  const acquisitionActive = isAcquisitionPromotion(catalog);
  const checkoutWarning = promotionCheckoutWarning(catalog);

  const cards = [
    {
      key: "basic",
      tier: catalog.basic?.display_name || "Basic",
      price: catalog.basic?.formatted || "Free",
      note: "Start free — no card required",
      listPrice: null,
      featured: false,
      features: FEATURES.basic,
    },
    {
      key: "plus",
      tier: catalog.plans?.plus?.display_name || "Plus",
      price: promotionPriceLabel(catalog, "plus", interval) || "$9.99",
      note: promotionPriceNote(catalog, "plus", interval),
      listPrice: catalog.plans?.plus?.intervals?.[interval]?.formatted || null,
      featured: true,
      features: FEATURES.plus,
    },
    {
      key: "business",
      tier: catalog.plans?.business?.display_name || "Business",
      price: promotionPriceLabel(catalog, "business", interval) || "$14.99",
      note: catalog.trial_available
        ? "Business trial available"
        : promotionPriceNote(catalog, "business", interval),
      listPrice: catalog.plans?.business?.intervals?.[interval]?.formatted || null,
      featured: false,
      features: FEATURES.business,
    },
  ];

  return (
    <PublicPageShell>
      <PageTitle
        title="Pricing — Check Station"
        description="Basic, Plus, and Business plans with monthly or yearly billing."
      />

      <section className="public-section">
        <h1>Pricing</h1>
        <p className="public-lead">
          V1 plans are Basic, Plus, and Business. Paid checkout starts after you create a
          workspace — there are no anonymous paid workspaces.
        </p>
        {acquisitionActive ? (
          <p className="pricing-promo-banner" role="status">
            {promo.label}: {promo.summary}
          </p>
        ) : null}
        {checkoutWarning && acquisitionActive ? (
          <p className="pricing-promo-checkout-note" role="note">
            {checkoutWarning}
          </p>
        ) : null}
        <div className="pricing-interval-toggle" role="group" aria-label="Billing interval">
          <button
            type="button"
            className={interval === "monthly" ? "btn-secondary is-selected" : "btn-secondary"}
            onClick={() => setInterval("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={interval === "yearly" ? "btn-secondary is-selected" : "btn-secondary"}
            onClick={() => setInterval("yearly")}
          >
            Yearly
          </button>
        </div>
      </section>

      <section className="public-section">
        <div className="pricing-grid">
          {cards.map((plan) => {
            const showStrike =
              plan.key !== "basic" &&
              acquisitionActive &&
              plan.listPrice &&
              plan.listPrice !== plan.price;
            return (
              <article
                key={plan.key}
                className={
                  plan.featured ? "pricing-card pricing-card-featured" : "pricing-card"
                }
              >
                <div className="pricing-tier">{plan.tier}</div>
                <div className="pricing-price">{plan.price}</div>
                {showStrike ? (
                  <p className="pricing-list-price">Normally {plan.listPrice}</p>
                ) : null}
                <p className="pricing-price-note">{plan.note}</p>
                <ul className="pricing-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Link className="btn-primary" to={ctaTo}>
                  {plan.key === "basic"
                    ? ctaLabel
                    : signedIn
                      ? "Choose in Account"
                      : "Register to subscribe"}
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="public-section public-section-muted">
        <h2>Ready when you are</h2>
        <p className="public-lead">
          Registration creates a Basic workspace. Upgrade to Plus or Business from Account →
          Subscription after you sign in.
        </p>
        <Link className="btn-primary" to={ctaTo}>
          {ctaLabel}
        </Link>
      </section>
    </PublicPageShell>
  );
}
