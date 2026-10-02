import { useEffect, useId, useRef, useState } from "react";
import type { AppLocale } from "@checkstation/i18n";
import { LOCALE_NATIVE_LABELS, SUPPORTED_LOCALES } from "@checkstation/i18n";
import { BrandMark } from "../components/ui";
import {
  PRODUCT_TOUR_SLIDE_COUNT,
  productTourSlides,
  productTourUi,
} from "./productTourContent";
import { ProductTourVisual } from "./ProductTourVisuals";
import "./productTour.css";

export type ProductTourMode = "first-launch" | "replay-auth" | "replay-help";

type Props = {
  locale: AppLocale;
  mode: ProductTourMode;
  onLocaleChange: (locale: AppLocale) => void;
  onSkip: () => void;
  onClose: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
};

export function DesktopProductTour({
  locale,
  mode,
  onLocaleChange,
  onSkip,
  onClose,
  onCreateAccount,
  onSignIn,
}: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const pendingIndex = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const slides = productTourSlides(locale);
  const ui = productTourUi(locale);
  const slide = slides[index] || slides[0];
  const isLast = index >= PRODUCT_TOUR_SLIDE_COUNT - 1;
  const isFirst = index <= 0;
  const isReplay = mode !== "first-launch";

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  function goTo(next: number) {
    if (next < 0 || next >= PRODUCT_TOUR_SLIDE_COUNT || next === index || phase !== "idle") return;
    pendingIndex.current = next;
    setPhase("leaving");
    window.setTimeout(() => {
      setIndex(pendingIndex.current ?? next);
      setPhase("entering");
      window.setTimeout(() => setPhase("idle"), 20);
    }, 200);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (!isFirst) goTo(index - 1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (!isLast) goTo(index + 1);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (isReplay) onClose();
        else onSkip();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const phaseClass =
    phase === "leaving" ? "is-leaving" : phase === "entering" ? "is-entering" : "";

  return (
    <div
      ref={rootRef}
      className="product-tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className="product-tour-header">
        <div className="product-tour-brand">
          <BrandMark className="product-tour-logo" decorative />
          <strong>{ui.brand}</strong>
        </div>
        <div className="product-tour-header-actions">
          <div className="product-tour-lang" role="group" aria-label={ui.languageLabel}>
            {SUPPORTED_LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                className={locale === code ? "is-active" : ""}
                aria-pressed={locale === code}
                onClick={() => onLocaleChange(code)}
              >
                {code === "en" ? "EN" : "JA"}
                <span className="sr-only"> {LOCALE_NATIVE_LABELS[code]}</span>
              </button>
            ))}
          </div>
          {!isLast ? (
            <button type="button" className="product-tour-skip" onClick={onSkip}>
              {ui.skip}
            </button>
          ) : null}
        </div>
      </header>

      <main className="product-tour-main">
        <div className={`product-tour-frame slide-${slide.id} ${phaseClass}`}>
          <section className="product-tour-copy">
            <h1 id={titleId}>{slide.headline}</h1>
            <p>{slide.body}</p>
            {slide.banner ? <div className="product-tour-banner">{slide.banner}</div> : null}
            {slide.points && slide.points.length > 0 ? (
              <ul className="product-tour-points">
                {slide.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
          </section>
          <section className="product-tour-visual">
            <ProductTourVisual slideId={slide.id} locale={locale} />
          </section>
        </div>
      </main>

      <footer className="product-tour-footer">
        <div
          className="product-tour-dots"
          role="tablist"
          aria-label={ui.progressLabel(index + 1, PRODUCT_TOUR_SLIDE_COUNT)}
        >
          {slides.map((item, dotIndex) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={dotIndex === index}
              aria-label={ui.progressLabel(dotIndex + 1, PRODUCT_TOUR_SLIDE_COUNT)}
              className={dotIndex === index ? "is-active" : ""}
              onClick={() => goTo(dotIndex)}
            />
          ))}
        </div>
        <div className="product-tour-nav">
          <div className="product-tour-nav-start">
            {!isFirst ? (
              <button type="button" className="pt-btn-secondary" onClick={() => goTo(index - 1)}>
                {ui.back}
              </button>
            ) : (
              <span className="product-tour-nav-spacer" aria-hidden="true" />
            )}
          </div>
          <div className="product-tour-nav-end">
            {isLast ? (
              <>
                <button type="button" className="pt-btn-secondary" onClick={onSignIn}>
                  {ui.signIn}
                </button>
                <button type="button" className="pt-btn-primary" onClick={onCreateAccount}>
                  {ui.createAccount}
                </button>
              </>
            ) : (
              <button type="button" className="pt-btn-primary" onClick={() => goTo(index + 1)}>
                {ui.next}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
