import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api.js";
import PublicPageShell from "./PublicPageShell.jsx";
import { canViewBilling } from "./workspaceSession.js";
import { workspacePlanKey } from "./workspaceEntitlements.js";
import { pricingCta, pricingFeatureList } from "./pricingPage.js";
import PricingCardsLoadingState from "./PricingCardsLoadingState.js";
import { pricingTemplateClass } from "./pricingTemplates.js";
import { PromotionalText } from "./promotionalText.js";
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
  entitlements: {
    basic: {
      features: {
        structured_groups: false,
        staff_management: false,
        report_export_csv: false,
        group_forward_emails: false,
        structured_snapshot_import: false,
        ads_required: true,
      },
      limits: {
        active_standard_groups: 2,
        members: 10,
        workspace_admins: 0,
        workspace_staff: 0,
      },
    },
    plus: {
      features: {
        structured_groups: false,
        staff_management: true,
        report_export_csv: true,
        group_forward_emails: true,
        structured_snapshot_import: false,
        ads_required: false,
      },
      limits: {
        active_standard_groups: 10,
        members: 50,
        workspace_admins: 2,
        workspace_staff: 5,
      },
    },
    business: {
      features: {
        structured_groups: true,
        staff_management: true,
        report_export_csv: true,
        group_forward_emails: true,
        structured_snapshot_import: true,
        ads_required: false,
      },
      limits: {
        active_standard_groups: 30,
        members: 300,
        workspace_admins: 5,
        workspace_staff: 25,
      },
    },
  },
};

function yearlySavingsLabel(catalog) {
  const plusMonthly = Number(catalog?.plans?.plus?.intervals?.monthly?.cents);
  const plusYearly = Number(catalog?.plans?.plus?.intervals?.yearly?.cents);
  if (!Number.isFinite(plusMonthly) || !Number.isFinite(plusYearly) || plusMonthly <= 0) {
    return null;
  }
  const savedMonths = Math.round((plusMonthly * 12 - plusYearly) / plusMonthly);
  return savedMonths > 0 ? `Save ${savedMonths} months` : null;
}

export default function PublicPricingScreen({ session = null }) {
  const [interval, setInterval] = useState("monthly");
  const [catalog, setCatalog] = useState(FALLBACK_CATALOG);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await api.getBillingCatalog();
        if (!cancelled && result?.data) {
          setCatalog({
            ...FALLBACK_CATALOG,
            ...result.data,
            entitlements: {
              ...FALLBACK_CATALOG.entitlements,
              ...(result.data.entitlements || {}),
            },
          });
        }
      } catch {
        /* keep frozen fallback catalog */
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const signedIn = Boolean(session?.workspace);
  const canOpenSubscription = signedIn && canViewBilling(session);
  const currentPlanKey = signedIn ? workspacePlanKey(session) : null;
  const ctaContext = { signedIn, canOpenSubscription, currentPlanKey };
  const promo = catalogPromotion(catalog);
  const acquisitionActive = isAcquisitionPromotion(catalog);
  const checkoutWarning = promotionCheckoutWarning(catalog);
  const yearlySavings = yearlySavingsLabel(catalog);
  const templateClass = catalogLoading ? null : pricingTemplateClass(catalog);
  const trialDays = Number(catalog?.builtin_trial_days);
  const businessTrialAvailable =
    Boolean(catalog?.builtin_trial_offered) && Number.isFinite(trialDays) && trialDays > 0;
  const paymentReassurance = catalog?.stripe_configured
    ? "Secure web payments via Stripe"
    : "Paid plans managed in your workspace";
  const planChangeReassurance = catalog?.stripe_configured
    ? "Cancel or downgrade at period end"
    : "Plan changes follow your billing period";

  const cards = [
    {
      key: "basic",
      tier: catalog.basic?.display_name || "Basic",
      price: catalog.basic?.formatted || "Free",
      note: "A simple place to begin — no card required",
      listPrice: null,
      featured: false,
      features: pricingFeatureList(catalog, "basic"),
    },
    {
      key: "plus",
      tier: catalog.plans?.plus?.display_name || "Plus",
      price: promotionPriceLabel(catalog, "plus", interval) || "$9.99",
      note: promotionPriceNote(catalog, "plus", interval),
      listPrice: catalog.plans?.plus?.intervals?.[interval]?.formatted || null,
      featured: false,
      features: pricingFeatureList(catalog, "plus"),
    },
    {
      key: "business",
      tier: catalog.plans?.business?.display_name || "Business",
      price: promotionPriceLabel(catalog, "business", interval) || "$14.99",
      note: promotionPriceNote(catalog, "business", interval),
      listPrice: catalog.plans?.business?.intervals?.[interval]?.formatted || null,
      featured: true,
      features: pricingFeatureList(catalog, "business"),
    },
  ];

  return (
    <PublicPageShell>
      <PageTitle
        title="Pricing — CheckStation"
        description="Simple plans for every workspace. Start free and upgrade anytime."
      />

      <div className="pricing-sales">
        <section className="pricing-sales-header">
          <div className="pricing-sales-header-copy">
            <p className="pricing-sales-kicker">Simple, flexible pricing</p>
            <h1>Choose the plan that fits today.</h1>
            <p>Start free, then upgrade when you need more room to grow.</p>
          </div>
          <div className="pricing-interval-wrap">
            <p>Billing</p>
            <div className="pricing-interval-toggle" role="group" aria-label="Billing interval">
              <button
                type="button"
                className={interval === "monthly" ? "is-selected" : ""}
                onClick={() => setInterval("monthly")}
              >
                <span>Monthly</span>
                <small>Stay flexible</small>
              </button>
              <button
                type="button"
                className={interval === "yearly" ? "is-selected" : ""}
                onClick={() => setInterval("yearly")}
              >
                <span>Yearly</span>
                <small>{yearlySavings || "Best value"}</small>
              </button>
            </div>
            {interval === "yearly" && yearlySavings ? (
              <p className="pricing-yearly-saving" role="status">{yearlySavings} with yearly billing</p>
            ) : null}
          </div>
          {businessTrialAvailable ? (
            <p className="pricing-header-trust"><span>{trialDays} days</span> Business trial, no card required</p>
          ) : null}
        </section>

        {!catalogLoading ? (
          <PromotionalText catalog={catalog} className="pricing-promotional-text" />
        ) : null}
        {!catalogLoading && acquisitionActive ? (
          <section className="pricing-promo-banner" role="status">
            <strong>{promo.label}</strong><span>{promo.summary}</span>
          </section>
        ) : null}
        {!catalogLoading && checkoutWarning && acquisitionActive ? (
          <p className="pricing-promo-checkout-note" role="note">{checkoutWarning}</p>
        ) : null}

        <section className="pricing-card-section" aria-label="CheckStation plans">
          {catalogLoading ? (
            <PricingCardsLoadingState cardCount={3} />
          ) : (
            <>
              <div className="pricing-grid">
          {cards.map((plan) => {
            const showStrike =
              plan.key !== "basic" &&
              acquisitionActive &&
              plan.listPrice &&
              plan.listPrice !== plan.price;
            const cta = pricingCta(plan.key, ctaContext);
            return (
              <article
                key={plan.key}
                className={
                  plan.featured
                    ? `pricing-card pricing-card-featured ${templateClass}`
                    : `pricing-card ${templateClass}`
                }
              >
                <div className="pricing-card-body">
                  {plan.featured ? (
                    <p className="pricing-card-badge">Best value</p>
                  ) : (
                    <p className="pricing-card-badge pricing-card-badge-spacer" aria-hidden="true">
                      Best value
                    </p>
                  )}
                  <div className="pricing-tier">{plan.tier}</div>
                  <div className="pricing-price"><span>{plan.price}</span>{plan.key !== "basic" ? <small>/{interval === "yearly" ? "year" : "month"}</small> : null}</div>
                  {showStrike ? (
                    <p className="pricing-list-price">Normally {plan.listPrice}</p>
                  ) : (
                    <p className="pricing-list-price pricing-list-price-spacer" aria-hidden="true">
                      &nbsp;
                    </p>
                  )}
                  <p className="pricing-price-note">{plan.note}</p>
                  <ul className="pricing-features">
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </div>
                <Link className="btn-primary pricing-card-cta" to={cta.to}>
                  {cta.label} <span aria-hidden="true">→</span>
                </Link>
              </article>
            );
          })}
              </div>

              <div className="pricing-reassurance" aria-label="Billing reassurance">
                <p><span aria-hidden="true">✓</span> Start with Basic for free</p>
                <p><span aria-hidden="true">✓</span> No card required to begin</p>
                {businessTrialAvailable ? <p><span aria-hidden="true">✓</span> Business free for {trialDays} days</p> : null}
                <p><span aria-hidden="true">✓</span> Upgrade when you need more</p>
                <p><span aria-hidden="true">✓</span> {planChangeReassurance}</p>
                <p><span aria-hidden="true">✓</span> {paymentReassurance}</p>
              </div>
            </>
          )}
        </section>
      </div>
    </PublicPageShell>
  );
}
