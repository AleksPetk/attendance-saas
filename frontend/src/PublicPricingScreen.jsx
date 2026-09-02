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
import { usePromoLocale } from "./promo/PromoLocaleContext.jsx";
import { applyPromoSeo } from "./promo/seo.js";

const FALLBACK_CATALOG = {
  market: "global",
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
          amount_minor: 999,
          formatted: "$9.99",
          promotion: { active: false },
        },
        yearly: {
          interval: "yearly",
          cents: 9999,
          amount_minor: 9999,
          formatted: "$99.99",
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
          amount_minor: 1499,
          formatted: "$14.99",
          promotion: { active: false },
        },
        yearly: {
          interval: "yearly",
          cents: 14999,
          amount_minor: 14999,
          formatted: "$149.99",
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

function yearlySavingsLabel(catalog, t) {
  const monthlyRow = catalog?.plans?.plus?.intervals?.monthly;
  const yearlyRow = catalog?.plans?.plus?.intervals?.yearly;
  const plusMonthly = Number(monthlyRow?.amount_minor ?? monthlyRow?.cents);
  const plusYearly = Number(yearlyRow?.amount_minor ?? yearlyRow?.cents);
  if (!Number.isFinite(plusMonthly) || !Number.isFinite(plusYearly) || plusMonthly <= 0) {
    return null;
  }
  const savedMonths = Math.round((plusMonthly * 12 - plusYearly) / plusMonthly);
  return savedMonths > 0 ? t("pricing.saveMonths", { count: savedMonths }) : null;
}

function localizePriceNote(note, interval, t) {
  if (!note || note === "Billed monthly" || note === "Billed yearly") {
    return interval === "yearly" ? t("pricing.billedYearly") : t("pricing.billedMonthly");
  }
  return note;
}

function AuthOrAppCta({ className, to, label, handoffToAuth }) {
  const isAuthPath = to === "/register" || to === "/login" || to === "/staff-login";
  if (isAuthPath) {
    return (
      <a
        href={to}
        className={className}
        onClick={(event) => {
          event.preventDefault();
          handoffToAuth(to);
        }}
      >
        {label} <span aria-hidden="true">→</span>
      </a>
    );
  }
  return (
    <Link className={className} to={to}>
      {label} <span aria-hidden="true">→</span>
    </Link>
  );
}

export default function PublicPricingScreen({ session = null }) {
  const { t, locale, pathFor, handoffToAuth } = usePromoLocale();
  const [interval, setInterval] = useState("monthly");
  const [catalog, setCatalog] = useState(FALLBACK_CATALOG);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    applyPromoSeo({
      locale,
      title: t("meta.pricingTitle"),
      description: t("meta.pricingDescription"),
      canonicalPath: pathFor("/pricing"),
    });
  }, [locale, pathFor, t]);

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
  const yearlySavings = yearlySavingsLabel(catalog, t);
  const templateClass = catalogLoading ? null : pricingTemplateClass(catalog);
  const trialDays = Number(catalog?.builtin_trial_days);
  const businessTrialAvailable =
    Boolean(catalog?.builtin_trial_offered) && Number.isFinite(trialDays) && trialDays > 0;
  const paymentReassurance = catalog?.stripe_configured
    ? t("pricing.secureStripe")
    : t("pricing.paidPlansInWorkspace");
  const planChangeReassurance = catalog?.stripe_configured
    ? t("pricing.cancelDowngradePeriodEnd")
    : t("pricing.planChangesFollowPeriod");

  const basicFormatted = catalog.basic?.formatted || "Free";
  const basicPrice =
    /^free$/i.test(String(basicFormatted).trim())
      ? t("home.pricingCards.freeForDays")
      : basicFormatted;

  const ctaLabels = {
    getStartedFree: t("pricing.cta.getStartedFree"),
    choosePlus: t("pricing.cta.choosePlus"),
    goBusiness: t("pricing.cta.goBusiness"),
    manageSubscription: t("pricing.cta.manageSubscription"),
  };

  const cards = [
    {
      key: "basic",
      tier: catalog.basic?.display_name || "Basic",
      price: basicPrice,
      note: t("pricing.basicNote"),
      listPrice: null,
      featured: false,
      features: pricingFeatureList(catalog, "basic", t),
    },
    {
      key: "plus",
      tier: catalog.plans?.plus?.display_name || "Plus",
      price:
        promotionPriceLabel(catalog, "plus", interval) ||
        catalog.plans?.plus?.intervals?.[interval]?.formatted,
      note: localizePriceNote(promotionPriceNote(catalog, "plus", interval), interval, t),
      listPrice: catalog.plans?.plus?.intervals?.[interval]?.formatted || null,
      featured: false,
      features: pricingFeatureList(catalog, "plus", t),
    },
    {
      key: "business",
      tier: catalog.plans?.business?.display_name || "Business",
      price:
        promotionPriceLabel(catalog, "business", interval) ||
        catalog.plans?.business?.intervals?.[interval]?.formatted,
      note: localizePriceNote(promotionPriceNote(catalog, "business", interval), interval, t),
      listPrice: catalog.plans?.business?.intervals?.[interval]?.formatted || null,
      featured: true,
      features: pricingFeatureList(catalog, "business", t),
    },
  ];

  return (
    <PublicPageShell>
      <div className="pricing-sales">
        <section className="pricing-sales-header">
          <div className="pricing-sales-header-copy">
            <p className="pricing-sales-kicker">{t("pricing.kicker")}</p>
            <h1>{t("pricing.title")}</h1>
            <p>{t("pricing.lead")}</p>
          </div>
          <div className="pricing-interval-wrap">
            <p>{t("pricing.billingLabel")}</p>
            <div
              className="pricing-interval-toggle"
              role="group"
              aria-label={t("pricing.intervalAria")}
            >
              <button
                type="button"
                className={interval === "monthly" ? "is-selected" : ""}
                onClick={() => setInterval("monthly")}
              >
                <span>{t("pricing.monthly")}</span>
                <small>{t("pricing.monthlyHint")}</small>
              </button>
              <button
                type="button"
                className={interval === "yearly" ? "is-selected" : ""}
                onClick={() => setInterval("yearly")}
              >
                <span>{t("pricing.yearly")}</span>
                <small>{yearlySavings || t("pricing.yearlyHintDefault")}</small>
              </button>
            </div>
            {interval === "yearly" && yearlySavings ? (
              <p className="pricing-yearly-saving" role="status">
                {t("pricing.yearlySavingStatus", { label: yearlySavings })}
              </p>
            ) : null}
          </div>
          {businessTrialAvailable ? (
            <p className="pricing-header-trust">
              {t("pricing.trialBanner", { days: trialDays })}
            </p>
          ) : null}
        </section>

        {!catalogLoading ? (
          <PromotionalText catalog={catalog} className="pricing-promotional-text" />
        ) : null}
        {!catalogLoading && acquisitionActive ? (
          <section className="pricing-promo-banner" role="status">
            <strong>{promo.label}</strong>
            <span>{promo.summary}</span>
          </section>
        ) : null}
        {!catalogLoading && checkoutWarning && acquisitionActive ? (
          <p className="pricing-promo-checkout-note" role="note">
            {checkoutWarning}
          </p>
        ) : null}

        <section className="pricing-card-section" aria-label={t("pricing.plansAria")}>
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
                  const cta = pricingCta(plan.key, ctaContext, ctaLabels);
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
                          <p className="pricing-card-badge">{t("pricing.bestValue")}</p>
                        ) : (
                          <p
                            className="pricing-card-badge pricing-card-badge-spacer"
                            aria-hidden="true"
                          >
                            {t("pricing.bestValue")}
                          </p>
                        )}
                        <div className="pricing-tier">{plan.tier}</div>
                        <div className="pricing-price">
                          <span>{plan.price}</span>
                          {plan.key !== "basic" ? (
                            <small>
                              /
                              {interval === "yearly"
                                ? t("pricing.perYear")
                                : t("pricing.perMonth")}
                            </small>
                          ) : null}
                        </div>
                        {showStrike ? (
                          <p className="pricing-list-price">
                            {t("pricing.normally", { price: plan.listPrice })}
                          </p>
                        ) : (
                          <p
                            className="pricing-list-price pricing-list-price-spacer"
                            aria-hidden="true"
                          >
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
                      <AuthOrAppCta
                        className="btn-primary pricing-card-cta"
                        to={cta.to}
                        label={cta.label}
                        handoffToAuth={handoffToAuth}
                      />
                    </article>
                  );
                })}
              </div>

              <div className="pricing-reassurance" aria-label={t("pricing.reassuranceAria")}>
                <p>
                  <span aria-hidden="true">✓</span> {t("pricing.startBasicFree")}
                </p>
                <p>
                  <span aria-hidden="true">✓</span> {t("pricing.noCardToBegin")}
                </p>
                {businessTrialAvailable ? (
                  <p>
                    <span aria-hidden="true">✓</span>{" "}
                    {t("pricing.businessFreeDays", { days: trialDays })}
                  </p>
                ) : null}
                <p>
                  <span aria-hidden="true">✓</span> {t("pricing.upgradeWhenNeeded")}
                </p>
                <p>
                  <span aria-hidden="true">✓</span> {planChangeReassurance}
                </p>
                <p>
                  <span aria-hidden="true">✓</span> {paymentReassurance}
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </PublicPageShell>
  );
}
