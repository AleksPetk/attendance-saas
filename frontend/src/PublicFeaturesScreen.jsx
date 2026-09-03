import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "./PublicPageShell.jsx";
import LocalizedPromoImage from "./promo/LocalizedPromoImage.jsx";
import { usePromoLocale } from "./promo/PromoLocaleContext.jsx";
import { applyPromoSeo } from "./promo/seo.js";
import {
  featuresShowcaseImages,
  featuresShowcaseJaImages,
} from "./assets/features/first-section/showcaseImages.js";
import {
  membersGroupsStoryImages,
  membersGroupsStoryJaImages,
} from "./assets/features/second-section/storyImages.js";
import {
  configurableFlowDemo,
  configurableFlowDemoJa,
} from "./assets/features/third-section/demoVideos.js";
import {
  emailNotificationJaPairs,
  emailNotificationPairs,
} from "./assets/features/fourth-section/emailNotificationImages.js";
import {
  historyFeatureImages,
  historyFeatureJaImages,
} from "./assets/features/fifth-section/historyImages.js";
import { platformIcons } from "./assets/features/sixth-section/platformIcons.js";

const PLATFORM_ICON_KEYS = [
  "Browser",
  "iPhone & iPad",
  "Android phone & tablet",
  "Mac",
  "Windows",
];

function CheckIcon() {
  return (
    <span className="features-check" aria-hidden="true">
      ✓
    </span>
  );
}

function PlatformIcon({ iconKey }) {
  return (
    <span className="features-platform-icon" aria-hidden="true">
      <img src={platformIcons[iconKey]} alt="" width="128" height="128" />
    </span>
  );
}

function FeaturesShowcaseCarousel() {
  const { t, locale } = usePromoLocale();
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const isJa = locale === "ja";
  const images = isJa ? featuresShowcaseJaImages : featuresShowcaseImages;

  useEffect(() => {
    setActiveIndex(0);
  }, [locale]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.("change", updatePreference);
    return () => media.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, images.length, reducedMotion]);

  function move(direction) {
    setActiveIndex(
      (current) =>
        (current + direction + images.length) % images.length,
    );
  }

  return (
    <figure
      className="features-showcase-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={t("features.carouselAria")}
    >
      <div className="features-showcase-carousel-stage">
        {images.map((image, index) => (
          <img
            key={image.src}
            className={index === activeIndex ? "is-active" : ""}
            src={image.src}
            alt={index === activeIndex ? image.alt : ""}
            width="1600"
            height="900"
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
            aria-hidden={index === activeIndex ? undefined : "true"}
          />
        ))}
        <button
          type="button"
          className="features-showcase-arrow features-showcase-arrow-left"
          aria-label={t("features.carouselPrevAria")}
          onClick={() => move(-1)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className="features-showcase-arrow features-showcase-arrow-right"
          aria-label={t("features.carouselNextAria")}
          onClick={() => move(1)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <figcaption className="features-showcase-status" aria-live="polite">
        {images[activeIndex].label}
      </figcaption>
    </figure>
  );
}

function FeaturesStoryCarousel({ images, label }) {
  const { t, locale } = usePromoLocale();
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const safeActiveIndex = activeIndex % images.length;

  useEffect(() => {
    setActiveIndex(0);
  }, [locale]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.("change", updatePreference);
    return () => media.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, images.length, reducedMotion]);

  function move(direction) {
    setActiveIndex((current) => (current + direction + images.length) % images.length);
  }

  return (
    <figure
      className="features-story-image features-story-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
    >
      <div className="features-story-carousel-stage">
        {images.map((image, index) => (
          <img
            key={image.src}
            className={index === safeActiveIndex ? "is-active" : ""}
            src={image.src}
            alt={index === safeActiveIndex ? image.alt : ""}
            width="1200"
            height="900"
            loading="lazy"
            decoding="async"
            aria-hidden={index === safeActiveIndex ? undefined : "true"}
          />
        ))}
        <button
          type="button"
          className="features-story-carousel-arrow features-story-carousel-arrow-left"
          aria-label={t("features.membersCarouselPrevAria")}
          onClick={() => move(-1)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className="features-story-carousel-arrow features-story-carousel-arrow-right"
          aria-label={t("features.membersCarouselNextAria")}
          onClick={() => move(1)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <figcaption className="features-story-carousel-status" aria-live="polite">
        {images[safeActiveIndex].label}
      </figcaption>
    </figure>
  );
}

function FeaturesStoryVideo({ demo, label }) {
  const { t, locale } = usePromoLocale();
  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const switchTimerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [inPlaybackRange, setInPlaybackRange] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    window.clearTimeout(switchTimerRef.current);
    setActiveIndex(0);
    setIsTransitioning(false);
  }, [locale]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.("change", updatePreference);
    return () => media.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (!demo.preloadNext || reducedMotion) return undefined;
    const nextClip = demo.clips[(activeIndex + 1) % demo.clips.length];
    const preloader = document.createElement("video");
    preloader.preload = "metadata";
    preloader.muted = true;
    preloader.playsInline = true;
    preloader.src = nextClip.src;
    preloader.load();
    return () => {
      preloader.removeAttribute("src");
      preloader.load();
    };
  }, [activeIndex, demo, reducedMotion]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    if (!("IntersectionObserver" in window)) {
      setInPlaybackRange(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInPlaybackRange(entry.isIntersecting),
      { rootMargin: "240px 0px", threshold: 0 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [demo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return undefined;
    if (inPlaybackRange) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    return undefined;
  }, [activeIndex, demo, inPlaybackRange, reducedMotion]);

  useEffect(() => () => window.clearTimeout(switchTimerRef.current), []);

  function continueSequence() {
    setIsTransitioning(true);
    window.clearTimeout(switchTimerRef.current);
    switchTimerRef.current = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % demo.clips.length);
    }, 220);
  }

  function revealCurrentClip() {
    setIsTransitioning(false);
    if (inPlaybackRange) videoRef.current?.play().catch(() => {});
  }

  return (
    <figure
      ref={frameRef}
      className="features-story-image features-story-video"
      role="group"
      aria-label={label}
    >
      <div className="features-story-video-frame">
        <img
          className="features-story-video-poster"
          src={demo.poster}
          alt={reducedMotion ? t("features.videoPosterAlt") : ""}
          width="1128"
          height="720"
          aria-hidden={reducedMotion ? undefined : "true"}
        />
        {!reducedMotion && (
          <video
            ref={videoRef}
            className={isTransitioning ? "is-transitioning" : ""}
            src={demo.clips[activeIndex].src}
            poster={demo.poster}
            autoPlay={inPlaybackRange}
            muted
            playsInline
            preload="metadata"
            disablePictureInPicture
            controlsList="nodownload noplaybackrate noremoteplayback"
            onEnded={continueSequence}
            onLoadedData={revealCurrentClip}
          />
        )}
        <span className="features-story-video-status" aria-live="polite">
          {demo.clips[activeIndex].label}
        </span>
        <span className="features-story-video-dots" aria-hidden="true">
          {demo.clips.map((clip, index) => (
            <i className={index === activeIndex ? "is-active" : ""} key={clip.src} />
          ))}
        </span>
      </div>
    </figure>
  );
}

function FeaturesEmailGallery() {
  const { t, locale } = usePromoLocale();
  const isJa = locale === "ja";
  const pairs = isJa ? emailNotificationJaPairs : emailNotificationPairs;

  return (
    <div className="features-email-flow" aria-label={t("features.emailGalleryAria")}>
      {pairs.map((pair) => (
        <div className="features-email-pair" role="group" aria-label={pair.label} key={pair.label}>
          {pair.images.map((image) => (
            <figure className="features-email-window" key={image.src}>
              <span className="features-email-window-chrome" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <img
                src={image.src}
                alt={image.alt}
                width="800"
                height="600"
                loading="lazy"
                decoding="async"
              />
            </figure>
          ))}
        </div>
      ))}
    </div>
  );
}

function FeaturesHistoryComposition() {
  const { t, locale } = usePromoLocale();
  const isJa = locale === "ja";
  const { main, inset } = isJa ? historyFeatureJaImages : historyFeatureImages;

  return (
    <figure
      className="features-story-image features-history-composition"
      aria-label={t("features.historyCompositionAria")}
    >
      <div className="features-history-main">
        <img
          src={main.src}
          alt={main.alt}
          width={main.width}
          height={main.height}
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="features-history-inset">
        <img
          src={inset.src}
          alt={inset.alt}
          width={inset.width}
          height={inset.height}
          loading="lazy"
          decoding="async"
        />
      </div>
    </figure>
  );
}

export default function PublicFeaturesScreen() {
  const { t, locale, pathFor } = usePromoLocale();
  const stories = t("features.stories");
  const included = t("features.included");
  const platforms = t("features.platforms");
  const emailExamples = t("features.emailExamples");
  const membersGroupsImages = locale === "ja"
    ? membersGroupsStoryJaImages
    : membersGroupsStoryImages;
  const configurableFlow = locale === "ja"
    ? configurableFlowDemoJa
    : configurableFlowDemo;

  useEffect(() => {
    applyPromoSeo({
      locale,
      title: t("meta.featuresTitle"),
      description: t("meta.featuresDescription"),
      canonicalPath: pathFor("/features"),
    });
  }, [locale, pathFor, t]);

  useEffect(() => {
    const page = document.querySelector(".features-page");
    if (!page) return undefined;
    const revealItems = [...page.querySelectorAll("[data-reveal]")];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
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
    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [locale]);

  const storyList = Array.isArray(stories) ? stories : [];

  return (
    <PublicPageShell>
      <div className="features-page">
        <section className="features-hero" data-reveal>
          <div className="features-hero-copy">
            <p className="features-kicker">{t("features.heroKicker")}</p>
            <h1>{t("features.heroTitle")}</h1>
            <p className="features-hero-lead">{t("features.heroLead")}</p>
            <div className="features-actions">
              <Link className="btn-primary features-primary-button" to={pathFor("/pricing")}>
                {t("features.ctaPricing")} <span aria-hidden="true">→</span>
              </Link>
              <Link className="btn-secondary features-secondary-button" to={pathFor("/how-it-works")}>
                {t("features.ctaHowItWorks")}
              </Link>
            </div>
            <div className="features-proof-row" aria-label={t("features.proofAria")}>
              <span>
                <CheckIcon /> {t("features.proofNoHardware")}
              </span>
              <span>
                <CheckIcon /> {t("features.proofConfigurable")}
              </span>
              <span>
                <CheckIcon /> {t("features.proofEveryday")}
              </span>
            </div>
          </div>
          <div className="features-hero-orbit" aria-hidden="true">
            <div className="features-orbit-glow" />
            <div className="features-orbit-card features-orbit-card-main">
              <span className="features-orbit-card-top">
                <span className="features-status-dot" /> {t("features.orbitBrand")}
              </span>
              <span className="features-orbit-card-title">
                {t("features.orbitTitle")}
                <br />
                <em>{t("features.orbitTitleEm")}</em>
              </span>
              <span className="features-orbit-bars">
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="features-orbit-card features-orbit-card-small features-orbit-members">
              <b>24</b>
              <span>{t("features.orbitMembers")}</span>
            </div>
            <div className="features-orbit-card features-orbit-card-small features-orbit-history">
              <b>✓</b>
              <span>{t("features.orbitHistory")}</span>
            </div>
            <span className="features-orbit-ring features-orbit-ring-one" />
            <span className="features-orbit-ring features-orbit-ring-two" />
          </div>
        </section>

        <section className="features-showcase" data-reveal>
          <div className="features-section-heading">
            <p className="features-kicker">{t("features.showcaseKicker")}</p>
            <h2>
              {String(t("features.showcaseTitle"))
                .split("\n")
                .map((line, index) => (
                  <Fragment key={`${line}-${index}`}>
                    {index > 0 ? <br /> : null}
                    {line}
                  </Fragment>
                ))}
            </h2>
            <p>{t("features.showcaseLead")}</p>
          </div>
          <FeaturesShowcaseCarousel />
        </section>

        <section className="features-stories" aria-label={t("features.storiesAria")}>
          {storyList.map((story, index) => {
            const isEmail = index === 2;
            const isHistory = index === 3;
            const hasImages = index === 0;
            const hasDemo = index === 1;

            if (isEmail) {
              return (
                <article
                  className={`features-story features-email-story features-story-${index % 2 ? "reverse" : "normal"}`}
                  data-reveal
                  key={`features-story-${index}`}
                >
                  <FeaturesEmailGallery />
                  <div className="features-story-copy features-email-copy">
                    <p className="features-kicker">{story.eyebrow}</p>
                    <h2>{story.title}</h2>
                    <p className="features-story-body">{story.body}</p>
                    <ul className="features-point-list features-email-capabilities">
                      {(story.points || []).map((point) => (
                        <li key={point}>
                          <CheckIcon />
                          {point}
                        </li>
                      ))}
                    </ul>
                    <div className="features-email-examples">
                      {(Array.isArray(emailExamples) ? emailExamples : []).map((example) => (
                        <article key={example.label}>
                          <span>{example.label}</span>
                          <p>{example.body}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </article>
              );
            }

            return (
              <article
                className={`features-story features-story-${index % 2 ? "reverse" : "normal"}`}
                data-reveal
                key={`features-story-${index}`}
              >
                {hasImages ? (
                  <FeaturesStoryCarousel images={membersGroupsImages} label={story.label} />
                ) : hasDemo ? (
                  <FeaturesStoryVideo demo={configurableFlow} label={story.label} />
                ) : isHistory ? (
                  <FeaturesHistoryComposition />
                ) : null}
                <div className="features-story-copy">
                  <p className="features-kicker">{story.eyebrow}</p>
                  <h2>{story.title}</h2>
                  <p className="features-story-body">{story.body}</p>
                  <ul className="features-point-list">
                    {(story.points || []).map((point) => (
                      <li key={point}>
                        <CheckIcon />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </section>

        <section className="features-platform" data-reveal>
          <div className="features-platform-copy">
            <p className="features-kicker">{t("features.platformKicker")}</p>
            <h2>{t("features.platformTitle")}</h2>
            <p>{t("features.platformLead")}</p>
            <Link className="features-text-link" to={pathFor("/how-it-works")}>
              {t("features.exploreWorkflow")} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="features-platform-list">
            {(Array.isArray(platforms) ? platforms : []).map((platform, index) => (
              <div className="features-platform-item" key={PLATFORM_ICON_KEYS[index] || platform}>
                <PlatformIcon iconKey={PLATFORM_ICON_KEYS[index]} />
                <span>{platform}</span>
                <span className="features-platform-arrow" aria-hidden="true">
                  ↗
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="features-included" data-reveal>
          <div className="features-section-heading features-section-heading-centered">
            <p className="features-kicker">{t("features.includedKicker")}</p>
            <h2>{t("features.includedTitle")}</h2>
            <p>{t("features.includedLead")}</p>
          </div>
          <div className="features-included-grid">
            {(Array.isArray(included) ? included : []).map((item) => (
              <article className="features-included-card" key={item.title}>
                <span className="features-included-icon">
                  <CheckIcon />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </PublicPageShell>
  );
}
