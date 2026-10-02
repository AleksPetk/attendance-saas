import { useApp } from "../lib/AppProvider";

export type BuiltinTrialOffer = {
  offered: boolean;
  days: number;
};

/** Same rule as Browser Workspace builtinTrialOfferFromCatalog. */
export function builtinTrialOfferFromCatalog(catalog: {
  builtin_trial_offered?: unknown;
  builtin_trial_days?: unknown;
} | null | undefined): BuiltinTrialOffer {
  const days = Number(catalog?.builtin_trial_days);
  const offered = Boolean(catalog?.builtin_trial_offered) && Number.isFinite(days) && days > 0;
  return { offered, days: offered ? days : 0 };
}

/** Registration-specific left panel (Browser Workspace RegistrationVisual). */
export function RegistrationVisual({ trialOffer }: { trialOffer: BuiltinTrialOffer }) {
  const { t } = useApp();
  const benefits = [
    { key: "setup", label: t("auth.register.visual.benefits.setup") },
    { key: "groups", label: t("auth.register.visual.benefits.groups") },
    { key: "devices", label: t("auth.register.visual.benefits.devices") },
  ] as const;
  const flow = [
    { key: "members", label: t("auth.register.visual.flow.members") },
    { key: "groups", label: t("auth.register.visual.flow.groups") },
    { key: "kiosk", label: t("auth.register.visual.flow.kiosk") },
    { key: "history", label: t("auth.register.visual.flow.history") },
  ] as const;
  const days = trialOffer.days || 7;

  return (
    <div className="registration-visual-content">
      <div className="registration-visual-copy">
        <span className="registration-eyebrow">{t("auth.register.visual.eyebrow")}</span>
        <h2>{t("auth.register.visual.headline")}</h2>
        <ul className="registration-benefits">
          {benefits.map((benefit) => (
            <li key={benefit.key}>
              <span aria-hidden="true">✓</span>
              {benefit.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="registration-flow" aria-label={t("auth.register.visual.flowAriaLabel")}>
        {flow.map((step, index) => (
          <div className="registration-flow-step" key={step.key}>
            <span className="registration-flow-node">{step.label}</span>
            {index < flow.length - 1 ? <span className="registration-flow-line" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
      {trialOffer.offered ? (
        <div className="registration-free-copy">
          <strong>{t("auth.register.visual.trialHeadline")}</strong>
          <span>{t("auth.register.visual.trialBody", { days })}</span>
        </div>
      ) : null}
    </div>
  );
}
