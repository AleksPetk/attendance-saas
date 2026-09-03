import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api.js";
import { builtinTrialOfferFromCatalog } from "./builtinTrialOffer.js";
import PublicPageShell from "./PublicPageShell.jsx";
import ProductImageSlot from "./ProductImageSlot.jsx";
import LocalizedPromoImage from "./promo/LocalizedPromoImage.jsx";
import { usePromoLocale } from "./promo/PromoLocaleContext.jsx";
import { applyPromoSeo } from "./promo/seo.js";
import { ConnectionVisual } from "./components.jsx";
import {
  homeGroupCommunicationImages,
  homeGroupCommunicationJaImages,
  homeKioskStyleImages,
  homeKioskStyleJaImages,
  homeRealSetupsImage,
  homeRealSetupsJaImage,
  homeValueIcons,
  homeWorkspaceImages,
  homeWorkspaceJaImages,
  homeWorkflowImage,
  homeWorkflowJaImage,
} from "./assets/home/homeImages.js";

const FALLBACK_TRIAL_CATALOG = {
  builtin_trial_days: 7,
  builtin_trial_offered: true,
};

const VALUE_ICONS = [
  homeValueIcons.startQuickly,
  homeValueIcons.fitWorkflow,
  homeValueIcons.seeHistory,
];

const STEP_ICONS = ["workspace", "people", "kiosk", "history"];

const KIOSK_META = [
  { key: "school", color: "#2563eb", image: homeKioskStyleImages.school },
  { key: "warehouse", color: "#f59e0b", image: homeKioskStyleImages.warehouse },
  { key: "cafe", color: "#ea580c", image: homeKioskStyleImages.cafe },
  { key: "office", color: "#0ea5e9", image: homeKioskStyleImages.office },
  { key: "club", color: "#8b5cf6", image: homeKioskStyleImages.club },
];

const HERO_WORD_DURATION = 3400;
const HERO_PARTICLES = [
  { x: "55%", y: "16%", size: "3px", duration: "15s", delay: "-4s", drift: "-22px" },
  { x: "64%", y: "72%", size: "5px", duration: "19s", delay: "-11s", drift: "28px" },
  { x: "72%", y: "28%", size: "2px", duration: "13s", delay: "-7s", drift: "18px" },
  { x: "80%", y: "82%", size: "3px", duration: "21s", delay: "-14s", drift: "-26px" },
  { x: "87%", y: "19%", size: "4px", duration: "17s", delay: "-8s", drift: "24px" },
  { x: "92%", y: "61%", size: "2px", duration: "14s", delay: "-2s", drift: "-18px" },
  { x: "76%", y: "52%", size: "3px", duration: "23s", delay: "-17s", drift: "20px" },
];

function AuthCta({ className, to, handoffToAuth, children }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        handoffToAuth(to);
      }}
    >
      {children}
    </a>
  );
}

function Check() {
  return (
    <span className="home-sales-check" aria-hidden="true">
      ✓
    </span>
  );
}

function StepIcon({ type }) {
  const paths = {
    workspace: (
      <>
        <path d="M4 5.5h16v12H4z" />
        <path d="M8 21h8M12 17.5V21M7.5 9h9" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19c.4-3.2 2.2-5 5.5-5s5.1 1.8 5.5 5M15 6.5a2.5 2.5 0 0 1 0 5M16.5 14c2.4.3 3.7 1.8 4 4" />
      </>
    ),
    kiosk: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8.5 7.5h7M8.5 11.5h3M15.5 11.5h.01M8.5 15.5h.01M12 15.5h3.5" />
      </>
    ),
    history: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" />
        <path d="M4 4v4.6h4.6M12 7.5V12l3 2" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[type]}
    </svg>
  );
}

function HeroFeatureWord({ active, reducedMotion, words, builtAround }) {
  const [wordIndex, setWordIndex] = useState(0);
  const remainingRef = useRef(HERO_WORD_DURATION);
  const list = Array.isArray(words) && words.length ? words : ["ATTENDANCE"];

  useEffect(() => {
    if (!active || reducedMotion) return undefined;
    const startedAt = window.performance.now();
    let completed = false;
    const timer = window.setTimeout(() => {
      completed = true;
      remainingRef.current = HERO_WORD_DURATION;
      setWordIndex((current) => (current + 1) % list.length);
    }, remainingRef.current);

    return () => {
      window.clearTimeout(timer);
      if (!completed) {
        remainingRef.current = Math.max(
          100,
          remainingRef.current - (window.performance.now() - startedAt),
        );
      }
    };
  }, [active, list.length, reducedMotion, wordIndex]);

  const word = reducedMotion ? list[0] : list[wordIndex % list.length];

  return (
    <div className="home-hero-feature-word" aria-hidden="true">
      <span className="home-hero-feature-label">{builtAround}</span>
      <span className="home-hero-feature-letters" key={word}>
        {[...word].map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            style={{
              "--letter-index": index,
              "--letter-x": `${((index % 3) - 1) * 5}px`,
              "--letter-y": `${index % 2 === 0 ? -4 : 5}px`,
            }}
          >
            {letter}
          </span>
        ))}
      </span>
    </div>
  );
}

function WorkspaceOverviewCarousel() {
  const { t, locale } = usePromoLocale();
  const [activeIndex, setActiveIndex] = useState(0);
  const images = locale === "ja" ? homeWorkspaceJaImages : homeWorkspaceImages;
  const visibleIndex = images.length ? activeIndex % images.length : 0;

  useEffect(() => {
    if (images.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, images.length]);

  function move(direction) {
    setActiveIndex(
      (current) =>
        (current + direction + images.length) % images.length,
    );
  }

  return (
    <figure
      className="home-sales-preview-image home-workspace-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={t("home.carouselAria")}
    >
      <div className="home-workspace-carousel-stage">
        {images.map((image, index) => (
          <img
            key={image.src}
            className={index === visibleIndex ? "is-active" : ""}
            src={image.src}
            alt={index === visibleIndex ? image.alt : ""}
            width={locale === "ja" ? "1200" : "1600"}
            height={locale === "ja" ? "675" : "900"}
            loading="lazy"
            decoding="async"
            aria-hidden={index === visibleIndex ? undefined : "true"}
          />
        ))}
        {images.length > 1 ? (
          <>
            <button
              type="button"
              className="home-workspace-carousel-arrow home-workspace-carousel-arrow-left"
              aria-label={t("home.carouselPrevAria")}
              onClick={() => move(-1)}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className="home-workspace-carousel-arrow home-workspace-carousel-arrow-right"
              aria-label={t("home.carouselNextAria")}
              onClick={() => move(1)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </>
        ) : null}
      </div>
    </figure>
  );
}

export default function PublicHomeScreen() {
  const { t, locale, pathFor, handoffToAuth } = usePromoLocale();
  const [kioskStyle, setKioskStyle] = useState(0);
  const [heroInView, setHeroInView] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [trialCatalog, setTrialCatalog] = useState(FALLBACK_TRIAL_CATALOG);
  const heroRef = useRef(null);

  const trialOffer = builtinTrialOfferFromCatalog(trialCatalog);
  const trialValues = { days: trialOffer.days || FALLBACK_TRIAL_CATALOG.builtin_trial_days };

  const values = t("home.values");
  const featureItems = t("home.featureItems");
  const steps = t("home.steps");
  const kioskStyles = t("home.kioskStyles");
  const useCases = t("home.usecases");
  const groupEmailExamples = t("home.groupEmailExamples");
  const heroWords = t("home.heroFeatureWords");
  const cards = {
    startHere: t("home.pricingCards.startHere", trialValues),
    businessTrial: t("home.pricingCards.businessTrial"),
    freeForDays: t("home.pricingCards.freeForDays"),
    freeForDaysSmall: t("home.pricingCards.freeForDaysSmall", trialValues),
    businessTrialBody: t("home.pricingCards.businessTrialBody", trialValues),
    noCardRequired: t("home.pricingCards.noCardRequired"),
    stayFree: t("home.pricingCards.stayFree"),
    basic: t("home.pricingCards.basic"),
    zeroToStart: t("home.pricingCards.zeroToStart"),
    zeroToStartSmall: t("home.pricingCards.zeroToStartSmall"),
    basicBody: t("home.pricingCards.basicBody"),
    upgradeWhenReady: t("home.pricingCards.upgradeWhenReady"),
  };

  const selectedMeta = KIOSK_META[kioskStyle] || KIOSK_META[0];
  const selectedStyle = {
    ...(Array.isArray(kioskStyles) ? kioskStyles[kioskStyle] : {}),
    ...selectedMeta,
    jaImage: homeKioskStyleJaImages[selectedMeta.key] || null,
  };

  useEffect(() => {
    applyPromoSeo({
      locale,
      title: t("meta.homeTitle"),
      description: t("meta.homeDescription", trialValues),
      canonicalPath: pathFor("/"),
    });
  }, [locale, pathFor, t, trialValues.days]);

  useEffect(() => {
    let cancelled = false;
    async function loadTrialCatalog() {
      try {
        const result = await api.getBillingCatalog();
        if (!cancelled && result?.data) {
          setTrialCatalog({
            ...FALLBACK_TRIAL_CATALOG,
            ...result.data,
          });
        }
      } catch {
        /* keep fallback trial catalog */
      }
    }
    loadTrialCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const page = document.querySelector(".home-sales");
    if (!page) return undefined;
    const items = [...page.querySelectorAll("[data-reveal]")];
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      items.forEach((item) => item.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.14 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(media.matches);
    updateMotionPreference();
    media.addEventListener?.("change", updateMotionPreference);
    return () => media.removeEventListener?.("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || !("IntersectionObserver" in window)) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroInView(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <PublicPageShell>
      <div className="home-sales">
        <section
          ref={heroRef}
          className="home-sales-hero"
          data-hero-motion={heroInView && !reducedMotion ? "active" : "paused"}
          data-reveal
        >
          <div className="home-hero-particles" aria-hidden="true">
            {HERO_PARTICLES.map((particle, index) => (
              <span
                className="home-hero-particle"
                key={index}
                style={{
                  "--particle-x": particle.x,
                  "--particle-y": particle.y,
                  "--particle-size": particle.size,
                  "--particle-duration": particle.duration,
                  "--particle-delay": particle.delay,
                  "--particle-drift": particle.drift,
                }}
              />
            ))}
          </div>
          <div className="home-sales-hero-copy">
            <p className="home-sales-kicker">{t("home.heroKicker")}</p>
            <h1>{t("home.heroTitle")}</h1>
            <p>{t("home.heroLead")}</p>
            <div className="home-sales-actions">
              <AuthCta
                className="btn-primary home-sales-primary"
                to="/register"
                handoffToAuth={handoffToAuth}
              >
                {t("home.ctaRegister")} <span aria-hidden="true">→</span>
              </AuthCta>
              <Link className="btn-secondary home-sales-secondary" to={pathFor("/how-it-works")}>
                {t("home.ctaHowItWorks")}
              </Link>
            </div>
            {trialOffer.offered ? (
              <div className="home-sales-trial">
                <span className="home-sales-trial-badge">
                  {t("home.trialBadge", trialValues)}
                </span>
                <span>{t("home.trialNote", trialValues)}</span>
              </div>
            ) : null}
          </div>
          <div className="home-sales-hero-visual" aria-hidden="true">
            <div className="home-sales-hero-glow" />
            <ConnectionVisual />
            <HeroFeatureWord
              active={heroInView}
              reducedMotion={reducedMotion}
              words={heroWords}
              builtAround={t("home.heroBuiltAround")}
            />
            <div className="home-sales-hero-note home-sales-note-one">
              <b>{t("home.heroNoteKiosksTitle")}</b>
              <span>{t("home.heroNoteKiosksBody")}</span>
            </div>
            <div className="home-sales-hero-note home-sales-note-two">
              <b>{t("home.heroNoteWorkspaceTitle")}</b>
              <span>{t("home.heroNoteWorkspaceBody")}</span>
            </div>
          </div>
        </section>

        <section className="home-sales-why" data-reveal>
          <header className="home-sales-heading home-sales-heading-centered">
            <p className="home-sales-kicker">{t("home.whyKicker")}</p>
            <h2>{t("home.whyTitle")}</h2>
            <p>{t("home.whyLead")}</p>
          </header>
          <div className="home-sales-value-grid">
            {(Array.isArray(values) ? values : []).map((value, index) => (
              <article key={value.title}>
                <span className="home-sales-value-icon">
                  <img
                    src={VALUE_ICONS[index]}
                    alt=""
                    width="40"
                    height="40"
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <h3>{value.title}</h3>
                <p>{value.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-sales-group-email" data-reveal>
          <div className="home-sales-group-email-copy">
            <p className="home-sales-kicker">{t("home.groupEmailKicker")}</p>
            <h2>
              {String(t("home.groupEmailTitle"))
                .split("\n")
                .map((line, index) => (
                  <Fragment key={`${line}-${index}`}>
                    {index > 0 ? <br /> : null}
                    {line}
                  </Fragment>
                ))}
            </h2>
            <p>{t("home.groupEmailLead")}</p>
            <div className="home-sales-group-email-examples">
              {(Array.isArray(groupEmailExamples) ? groupEmailExamples : []).map((example) => (
                <article key={example.label}>
                  <span>{example.label}</span>
                  <p>{example.body}</p>
                </article>
              ))}
            </div>
            <p className="home-sales-group-email-summary">{t("home.groupEmailSummary")}</p>
          </div>
          <div
            className="home-sales-group-email-visuals"
            aria-label={t("home.groupEmailVisualsAria")}
          >
            <ProductImageSlot
              label={t("home.groupEmailSenderLabel")}
              image={homeGroupCommunicationImages.sender}
              jaImage={homeGroupCommunicationJaImages.sender}
              aspect="4 / 5"
              className="home-sales-email-slot"
            />
            <ProductImageSlot
              label={t("home.groupEmailNotificationsLabel")}
              image={homeGroupCommunicationImages.notifications}
              jaImage={homeGroupCommunicationJaImages.notifications}
              aspect="4 / 5"
              className="home-sales-email-slot"
            />
          </div>
        </section>

        <section className="home-sales-features" data-reveal>
          <div className="home-sales-feature-visual">
            <LocalizedPromoImage
              image={homeWorkflowImage}
              jaImage={homeWorkflowJaImage}
              figureClassName="home-image-slot home-image-slot-filled home-sales-workflow-image home-image-slot-workflow"
              aspectRatio="4 / 5"
            />
          </div>
          <div className="home-sales-feature-copy">
            <p className="home-sales-kicker">{t("home.featuresKicker")}</p>
            <h2>{t("home.featuresTitle")}</h2>
            <p>{t("home.featuresLead")}</p>
            <div className="home-sales-feature-list">
              {(Array.isArray(featureItems) ? featureItems : []).map((item) => (
                <article key={item.title}>
                  <Check />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))}
            </div>
            <Link className="home-sales-text-link" to={pathFor("/features")}>
              {t("home.exploreFeatures")} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section className="home-sales-how" data-reveal>
          <header className="home-sales-heading">
            <p className="home-sales-kicker">{t("home.howKicker")}</p>
            <h2>{t("home.howTitle")}</h2>
            <p>{t("home.howLead")}</p>
          </header>
          <ol className="home-sales-step-grid">
            {(Array.isArray(steps) ? steps : []).map((step, index) => (
              <li key={step.number}>
                <span className="home-sales-step-marker">
                  <StepIcon type={STEP_ICONS[index]} />
                  <small>{step.number}</small>
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <Link className="btn-secondary home-sales-outline-button" to={pathFor("/how-it-works")}>
            {t("home.seeHowItWorks")} <span aria-hidden="true">→</span>
          </Link>
        </section>

        <section
          className="home-sales-kiosk"
          data-reveal
          style={{ "--style-accent": selectedStyle.color }}
        >
          <div className="home-sales-kiosk-copy">
            <p className="home-sales-kicker">{t("home.kioskKicker")}</p>
            <h2>{t("home.kioskTitle")}</h2>
            <p>{t("home.kioskLead")}</p>
            <div
              className="home-sales-style-picker"
              role="group"
              aria-label={t("home.kioskStylePickerAria")}
            >
              {(Array.isArray(kioskStyles) ? kioskStyles : []).map((style, index) => (
                <button
                  type="button"
                  key={style.name}
                  className={index === kioskStyle ? "is-active" : ""}
                  onClick={() => setKioskStyle(index)}
                >
                  {style.name}
                </button>
              ))}
            </div>
            <div className="home-sales-style-result" aria-live="polite">
              <span className="home-sales-style-swatch" />
              <div>
                <b>{t("home.kioskResultTitle", { name: selectedStyle.name })}</b>
                <span>{selectedStyle.tone}</span>
              </div>
            </div>
            <Link className="home-sales-text-link" to={pathFor("/features")}>
              {t("home.learnCustomization")} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ProductImageSlot
            label={t("home.kioskPreviewLabel", { name: selectedStyle.name })}
            caption={
              selectedStyle.image
                ? t("home.kioskExampleCaption", { name: selectedStyle.name })
                : t("home.kioskPlaceholderCaption")
            }
            image={selectedStyle.image}
            jaImage={selectedStyle.jaImage}
            aspect="4 / 3"
            className="home-sales-kiosk-image"
          />
        </section>

        <section className="home-sales-usecases" data-reveal>
          <header className="home-sales-heading">
            <p className="home-sales-kicker">{t("home.usecasesKicker")}</p>
            <h2>{t("home.usecasesTitle")}</h2>
          </header>
          <div className="home-sales-usecase-layout">
            <LocalizedPromoImage
              image={homeRealSetupsImage}
              jaImage={homeRealSetupsJaImage}
              figureClassName={`home-image-slot home-image-slot-filled home-sales-setups-image home-image-slot-setups${
                locale === "ja" ? " home-image-slot-setups-ja" : ""
              }`}
              aspectRatio={locale === "ja" ? "16 / 9" : "4 / 3"}
            />
            <div className="home-sales-usecase-list">
              {(Array.isArray(useCases) ? useCases : []).map((item, index) => (
                <article key={item}>
                  <span>0{index + 1}</span>
                  <h3>{item}</h3>
                  <Check />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="home-sales-pricing" data-reveal>
          <div className="home-sales-pricing-copy">
            <p className="home-sales-kicker">{t("home.pricingKicker")}</p>
            <h2>{t("home.pricingTitle")}</h2>
            <p>{t("home.pricingLead", trialValues)}</p>
            <Link className="btn-secondary home-sales-pricing-button" to={pathFor("/pricing")}>
              {t("home.viewPricing")} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="home-sales-price-cards">
            {trialOffer.offered ? (
              <article>
                <span className="home-sales-price-label">{cards.startHere}</span>
                <h3>{cards.businessTrial}</h3>
                <strong>
                  {cards.freeForDays} <small>{cards.freeForDaysSmall}</small>
                </strong>
                <p>{cards.businessTrialBody}</p>
                <span className="home-sales-no-card">
                  <Check /> {cards.noCardRequired}
                </span>
              </article>
            ) : null}
            <article>
              <span className="home-sales-price-label">{cards.stayFree}</span>
              <h3>{cards.basic}</h3>
              <strong>
                {cards.zeroToStart} <small>{cards.zeroToStartSmall}</small>
              </strong>
              <p>{cards.basicBody}</p>
              <span className="home-sales-no-card">
                <Check /> {cards.upgradeWhenReady}
              </span>
            </article>
          </div>
        </section>

        <section className="home-sales-preview" data-reveal>
          <div>
            <p className="home-sales-kicker">{t("home.previewKicker")}</p>
            <h2>{t("home.previewTitle")}</h2>
            <p>{t("home.previewLead")}</p>
          </div>
          <WorkspaceOverviewCarousel />
        </section>

        <section className="home-sales-final" data-reveal>
          <div>
            <p className="home-sales-kicker home-sales-kicker-light">{t("home.finalKicker")}</p>
            <h2>{t("home.finalTitle")}</h2>
            <p>{t("home.finalLead", trialValues)}</p>
          </div>
          <AuthCta
            className="btn-primary home-sales-final-button"
            to="/register"
            handoffToAuth={handoffToAuth}
          >
            {t("home.createWorkspace")} <span aria-hidden="true">→</span>
          </AuthCta>
        </section>
      </div>
    </PublicPageShell>
  );
}
