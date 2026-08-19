import { useEffect } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";

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

const PLANS = [
  {
    tier: "Starter",
    price: "TBD",
    note: "Pricing not yet finalized",
    featured: false,
    features: [
      "Core Members & Groups",
      "Kiosk check-in flows",
      "Action history",
      "Owner + limited staff",
    ],
  },
  {
    tier: "Pro",
    price: "TBD",
    note: "Most popular — details coming soon",
    featured: true,
    features: [
      "Everything in Starter",
      "More Groups & Members",
      "Advanced Group settings",
      "Automatic check-in (planned)",
      "Priority support (planned)",
    ],
  },
  {
    tier: "Business",
    price: "TBD",
    note: "For larger organizations",
    featured: false,
    features: [
      "Everything in Pro",
      "Custom email sender (planned)",
      "Extended staff roles (planned)",
      "Dedicated onboarding (planned)",
    ],
  },
];

export default function PublicPricingScreen() {
  return (
    <PublicPageShell>
      <PageTitle
        title="Pricing — Check Station"
        description="Starter, Pro, and Business tiers. Pricing and limits are not yet finalized."
      />

      <section className="public-section">
        <h1>Pricing</h1>
        <p className="public-lead">
          Plan structure is defined, but prices and limits are not final. Explore the workspace
          journey today — billing integration comes later.
        </p>
      </section>

      <section className="public-section">
        <div className="pricing-grid">
          {PLANS.map((plan) => (
            <article
              key={plan.tier}
              className={
                plan.featured ? "pricing-card pricing-card-featured" : "pricing-card"
              }
            >
              <div className="pricing-tier">{plan.tier}</div>
              <div className="pricing-price">{plan.price}</div>
              <p className="pricing-price-note">{plan.note}</p>
              <ul className="pricing-features">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-section-muted">
        <h2>Ready when you are</h2>
        <p className="public-lead">
          Create an account and your workspace will be created automatically. No billing required during early access.
        </p>
        <Link className="btn-primary" to="/register">
          Register free
        </Link>
      </section>
    </PublicPageShell>
  );
}
