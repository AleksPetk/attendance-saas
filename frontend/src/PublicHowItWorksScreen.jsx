import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import ProductImageSlot from "./ProductImageSlot.jsx";
import LocalizedPromoImage from "./promo/LocalizedPromoImage.jsx";
import { usePromoLocale } from "./promo/PromoLocaleContext.jsx";
import { applyPromoSeo } from "./promo/seo.js";
import section2StandardStructuredGroups from "./assets/how-it-works/section2-standard-structured-groups-1200.webp";
import section2StandardStructuredGroupsJa from "./assets/how-it-works/section2-standard-structured-groups-ja-1200.webp";
import section3Browser from "./assets/how-it-works/section3-browser-1200.webp";
import section3BrowserJa from "./assets/how-it-works/section3-browser-ja-1200.webp";
import section3Ipad from "./assets/how-it-works/section3-ipad-960.webp";
import section3IpadJa from "./assets/how-it-works/section3-ipad-ja-960.webp";
import section3Iphone from "./assets/how-it-works/section3-iphone-675.webp";
import section3IphoneJa from "./assets/how-it-works/section3-iphone-ja-675.webp";
import section4Admin from "./assets/how-it-works/section4-admin-1200.webp";
import section4Teacher from "./assets/how-it-works/section4-teacher-1200.webp";
import section4Manager from "./assets/how-it-works/section4-manager-1200.webp";
import section4Reception from "./assets/how-it-works/section4-reception-1200.webp";
import section5EverythingConnects from "./assets/how-it-works/section5-everything-connects-1200.webp";
import {
  HOW_IT_WORKS_SLIDESHOW_INTERVAL_MS,
  nextSlideshowIndex,
  shouldRunSlideshow,
} from "./howItWorksSlideshow.js";

const SECTION_TWO_ARTWORK = {
  width: 1200,
  height: 900,
  sizes: "(max-width: 880px) calc(100vw - 3rem), min(50vw, 35rem)",
  fallbackSrc: section2StandardStructuredGroups,
};

const SECTION_TWO_JA_ARTWORK = {
  width: 1200,
  height: 675,
  sizes: "(max-width: 880px) calc(100vw - 3rem), min(50vw, 35rem)",
  fallbackSrc: section2StandardStructuredGroupsJa,
};

const SECTION_THREE_DEVICES = {
  browser: {
    width: 1200,
    height: 675,
    sizes: "(max-width: 700px) calc(100vw - 3rem), min(74vw, 49rem)",
    fallbackSrc: section3Browser,
  },
  tablet: {
    width: 960,
    height: 720,
    sizes: "(max-width: 560px) calc(100vw - 4rem), min(45vw, 29rem)",
    fallbackSrc: section3Ipad,
  },
  phone: {
    width: 675,
    height: 1200,
    sizes: "(max-width: 560px) min(52vw, 11rem), min(21vw, 12.5rem)",
    fallbackSrc: section3Iphone,
  },
};

const SECTION_THREE_JA_DEVICES = {
  browser: {
    width: 1200,
    height: 675,
    sizes: "(max-width: 700px) calc(100vw - 3rem), min(74vw, 49rem)",
    fallbackSrc: section3BrowserJa,
  },
  tablet: {
    width: 960,
    height: 720,
    sizes: "(max-width: 560px) calc(100vw - 4rem), min(45vw, 29rem)",
    fallbackSrc: section3IpadJa,
  },
  phone: {
    width: 675,
    height: 1200,
    sizes: "(max-width: 560px) min(52vw, 11rem), min(21vw, 12.5rem)",
    fallbackSrc: section3IphoneJa,
  },
};

const SECTION_FOUR_SRCS = [
  section4Admin,
  section4Teacher,
  section4Manager,
  section4Reception,
];

const SECTION_FIVE_ARTWORK = {
  width: 1200,
  height: 900,
  sizes: "(max-width: 880px) calc(100vw - 3rem), min(55vw, 42rem)",
  fallbackSrc: section5EverythingConnects,
};

function CheckMark() {
  return (
    <span className="how-check" aria-hidden="true">
      ✓
    </span>
  );
}

function StaffWorkspaceSlideshow() {
  const { t, locale } = usePromoLocale();
  const rootRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [direction, setDirection] = useState(1);
  const [timerVersion, setTimerVersion] = useState(0);
  const [inViewport, setInViewport] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const isJa = locale === "ja";
  const staffSlides = t("howItWorks.staffSlides");
  const slides = (Array.isArray(staffSlides) ? staffSlides : []).map((slide, index) => ({
    ...slide,
    src: SECTION_FOUR_SRCS[index],
  }));

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !("IntersectionObserver" in window)) {
      setInViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInViewport(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (isJa) return undefined;
    if (!shouldRunSlideshow({ inViewport, interacting, reducedMotion, pageVisible })) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setDirection(1);
      setActiveSlide((current) => nextSlideshowIndex(current, slides.length, 1));
    }, HOW_IT_WORKS_SLIDESHOW_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [
    activeSlide,
    inViewport,
    interacting,
    isJa,
    pageVisible,
    reducedMotion,
    slides.length,
    timerVersion,
  ]);

  function navigate(directionDelta) {
    setDirection(directionDelta);
    setActiveSlide((current) => nextSlideshowIndex(current, slides.length, directionDelta));
    setTimerVersion((current) => current + 1);
  }

  function selectSlide(index) {
    setDirection(index >= activeSlide ? 1 : -1);
    setActiveSlide(index);
    setTimerVersion((current) => current + 1);
  }

  return (
    <div
      ref={rootRef}
      className="how-staff-slideshow"
      data-direction={direction > 0 ? "next" : "previous"}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false);
      }}
      aria-roledescription="carousel"
      aria-label={t("howItWorks.staffSlideshowAria")}
    >
      <div className="how-staff-slideshow-frame">
        <div className="how-staff-slides">
          {isJa ? (
            <figure className="how-staff-slide is-active">
              <LocalizedPromoImage
                as="div"
                aspectRatio="16 / 9"
                width={1200}
                height={675}
                alt={t("imagePlaceholder")}
              />
            </figure>
          ) : (
            slides.map((slide, index) => (
              <figure
                key={slide.role}
                className={`how-staff-slide${index === activeSlide ? " is-active" : ""}`}
                aria-hidden={index !== activeSlide}
              >
                <img
                  src={slide.src}
                  alt={index === activeSlide ? slide.alt : ""}
                  width="1200"
                  height="675"
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                />
              </figure>
            ))
          )}
        </div>
        {!isJa ? (
          <>
            <button
              type="button"
              className="how-staff-slide-arrow is-previous"
              onClick={() => navigate(-1)}
              aria-label={t("howItWorks.staffPrevAria")}
            >
              ‹
            </button>
            <button
              type="button"
              className="how-staff-slide-arrow is-next"
              onClick={() => navigate(1)}
              aria-label={t("howItWorks.staffNextAria")}
            >
              ›
            </button>
          </>
        ) : null}
      </div>
      {!isJa ? (
        <div className="how-staff-slide-dots" role="group" aria-label={t("howItWorks.staffDotsAria")}>
          {slides.map((slide, index) => (
            <button
              key={slide.role}
              type="button"
              className={index === activeSlide ? "is-active" : ""}
              onClick={() => selectSlide(index)}
              aria-label={t("howItWorks.staffShowViewAria", { role: slide.role })}
              aria-current={index === activeSlide ? "true" : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function PublicHowItWorksScreen() {
  const { t, locale, pathFor } = usePromoLocale();
  const [activeStep, setActiveStep] = useState(0);
  const steps = t("howItWorks.steps");
  const structurePoints = t("howItWorks.structurePoints");
  const simultaneousFoot = t("howItWorks.simultaneousFoot");
  const staffExamples = t("howItWorks.staffExamples");
  const journeySteps = Array.isArray(steps) ? steps : [];
  const selected = journeySteps[activeStep] || journeySteps[0] || {};

  useEffect(() => {
    applyPromoSeo({
      locale,
      title: t("meta.howItWorksTitle"),
      description: t("meta.howItWorksDescription"),
      ogDescription: t("meta.howItWorksOgDescription"),
      canonicalPath: pathFor("/how-it-works"),
    });
  }, [locale, pathFor, t]);

  useEffect(() => {
    const page = document.querySelector(".how-page");
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

  return (
    <PublicPageShell>
      <div className="how-page">
        <section id="your-journey" className="how-journey how-journey-hero" data-reveal>
          <div className="how-section-heading how-journey-heading">
            <p className="how-kicker">{t("howItWorks.journeyKicker")}</p>
            <h1>{t("howItWorks.journeyTitle")}</h1>
            <p>{t("howItWorks.journeyLead")}</p>
          </div>
          <div className="how-journey-layout">
            <ol className="how-step-list">
              {journeySteps.map((step, index) => (
                <li key={step.number}>
                  <button
                    type="button"
                    className={index === activeStep ? "how-step-button is-active" : "how-step-button"}
                    onClick={() => setActiveStep(index)}
                    onMouseEnter={() => setActiveStep(index)}
                  >
                    <span className="how-step-number">{step.number}</span>
                    <span>
                      <b>{step.title}</b>
                      <small>{step.navSub || step.eyebrow}</small>
                    </span>
                    <span className="how-step-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div key={selected.number} className="how-step-detail" aria-live="polite">
              <p className="how-kicker">{selected.eyebrow}</p>
              <span className="how-detail-number">{selected.number}</span>
              <h3>{selected.title}</h3>
              <p>{selected.body}</p>
              <div className="how-detail-note">
                <CheckMark />
                {selected.detail}
              </div>
            </div>
          </div>
        </section>

        <section className="how-structure" data-reveal>
          <div className="how-structure-copy">
            <p className="how-kicker">{t("howItWorks.structureKicker")}</p>
            <h2>{t("howItWorks.structureTitle")}</h2>
            <p>{t("howItWorks.structureLead")}</p>
            <div className="how-structure-points">
              {(Array.isArray(structurePoints) ? structurePoints : []).map((point) => (
                <span key={point}>
                  <CheckMark /> {point}
                </span>
              ))}
            </div>
          </div>
          <ProductImageSlot
            label={t("howItWorks.structureImageLabel")}
            image={{ ...SECTION_TWO_ARTWORK, alt: t("howItWorks.structureImageAlt") }}
            jaImage={{ ...SECTION_TWO_JA_ARTWORK, alt: t("howItWorks.structureImageAlt") }}
            aspect="4 / 3"
            className={`how-image-slot how-section2-artwork${locale === "ja" ? " how-section2-artwork-ja" : ""}`}
          />
        </section>

        <section className="how-simultaneous" data-reveal>
          <div className="how-section-heading how-heading-light">
            <p className="how-kicker">{t("howItWorks.simultaneousKicker")}</p>
            <h2>{t("howItWorks.simultaneousTitle")}</h2>
            <p>{t("howItWorks.simultaneousLead")}</p>
          </div>
          <div className="how-device-stage">
            <div className="how-device how-device-browser">
              <span className="how-device-label">{t("howItWorks.deviceAdminBrowser")}</span>
              <div className="how-device-shell how-device-shell-browser">
                <div className="how-browser-chrome" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <i />
                </div>
                <div className="how-device-viewport how-device-viewport-browser">
                  <ProductImageSlot
                    label={t("howItWorks.deviceBrowserLabel")}
                    image={{
                      ...SECTION_THREE_DEVICES.browser,
                      alt: t("howItWorks.deviceBrowserAlt"),
                    }}
                    jaImage={{
                      ...SECTION_THREE_JA_DEVICES.browser,
                      alt: t("howItWorks.deviceBrowserAlt"),
                    }}
                    aspect="16 / 9"
                    className="how-device-image"
                  />
                </div>
              </div>
            </div>
            <div className="how-device how-device-tablet">
              <span className="how-device-label">{t("howItWorks.deviceGroupTablet")}</span>
              <div className="how-device-shell how-device-shell-tablet">
                <div className="how-device-viewport how-device-viewport-tablet">
                  <ProductImageSlot
                    label={t("howItWorks.deviceTabletLabel")}
                    image={{
                      ...SECTION_THREE_DEVICES.tablet,
                      alt: t("howItWorks.deviceTabletAlt"),
                    }}
                    jaImage={{
                      ...SECTION_THREE_JA_DEVICES.tablet,
                      alt: t("howItWorks.deviceTabletAlt"),
                    }}
                    aspect="4 / 3"
                    className="how-device-image"
                  />
                </div>
              </div>
            </div>
            <div className="how-device how-device-phone">
              <span className="how-device-label">{t("howItWorks.deviceClassPhone")}</span>
              <div className="how-device-shell how-device-shell-phone">
                <span className="how-phone-island" aria-hidden="true" />
                <div className="how-device-viewport how-device-viewport-phone">
                  <ProductImageSlot
                    label={t("howItWorks.devicePhoneLabel")}
                    image={{
                      ...SECTION_THREE_DEVICES.phone,
                      alt: t("howItWorks.devicePhoneAlt"),
                    }}
                    jaImage={{
                      ...SECTION_THREE_JA_DEVICES.phone,
                      alt: t("howItWorks.devicePhoneAlt"),
                    }}
                    aspect="9 / 16"
                    className="how-device-image"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="how-simultaneous-foot">
            {(Array.isArray(simultaneousFoot) ? simultaneousFoot : []).map((item) => (
              <span key={item}>
                <CheckMark /> {item}
              </span>
            ))}
          </div>
        </section>

        <section className="how-staff" data-reveal>
          <StaffWorkspaceSlideshow />
          <div className="how-staff-copy">
            <p className="how-kicker">{t("howItWorks.staffKicker")}</p>
            <h2>{t("howItWorks.staffTitle")}</h2>
            <p>{t("howItWorks.staffLead")}</p>
            <div className="how-staff-examples">
              {(Array.isArray(staffExamples) ? staffExamples : []).map((example) => (
                <article key={example.title}>
                  <span>{String(example.title).slice(0, 1)}</span>
                  <div>
                    <h3>{example.title}</h3>
                    <p>{example.body}</p>
                  </div>
                </article>
              ))}
            </div>
            <p className="how-staff-note">{t("howItWorks.staffNote")}</p>
          </div>
        </section>

        <section className="how-history" data-reveal>
          <div>
            <p className="how-kicker">{t("howItWorks.historyKicker")}</p>
            <h2>{t("howItWorks.historyTitle")}</h2>
            <p>{t("howItWorks.historyLead")}</p>
            <Link className="how-text-link" to={pathFor("/features")}>
              {t("howItWorks.exploreFeatures")} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <LocalizedPromoImage
            image={{ ...SECTION_FIVE_ARTWORK, alt: t("howItWorks.historyImageAlt") }}
            shared
            alt={t("howItWorks.historyImageAlt")}
            figureClassName="product-image-slot product-image-slot-filled how-history-image how-section5-artwork"
            aspectRatio="4 / 3"
          />
        </section>
      </div>
    </PublicPageShell>
  );
}
