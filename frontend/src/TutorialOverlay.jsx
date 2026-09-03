import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { tutorialSummaryCopy } from "./tutorialSummary.js";

export function tutorialCardPosition(rect, viewport = {}) {
  if (!rect) return null;
  const width = Math.min(380, Math.max(280, (viewport.width || 1200) - 32));
  const height = 270;
  const gap = 18;
  const vw = viewport.width || 1200;
  const vh = viewport.height || 800;
  let left = rect.right + gap;
  let top = rect.top + rect.height / 2 - height / 2;
  if (left + width > vw - 16) left = rect.left - width - gap;
  if (left < 16) left = Math.max(16, (vw - width) / 2);
  top = Math.max(16, Math.min(top, vh - height - 16));
  return { left, top, width };
}

function TutorialActions({ index, total, automatic, busy, onBack, onNext, onSkip, onClose, t, tCommon }) {
  return (
    <div className="tutorial-actions">
      <div>
        {index > 0 ? (
          <button type="button" className="btn-secondary btn-sm" onClick={onBack} disabled={busy}>
            {t("tutorialOverlay.back")}
          </button>
        ) : null}
      </div>
      <div className="tutorial-actions-primary">
        <button type="button" className="btn-link" onClick={automatic ? onSkip : onClose} disabled={busy}>
          {automatic ? t("tutorialOverlay.skipTutorial") : t("tutorialOverlay.close")}
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={onNext} disabled={busy}>
          {index === total - 1 ? tCommon("finish") : tCommon("next")}
        </button>
      </div>
    </div>
  );
}

export default function TutorialOverlay({
  tour,
  targetRect,
  targetStatus,
  reducedMotion,
  busy,
  error,
  trial,
  onBack,
  onNext,
  onSkip,
  onClose,
  onDashboard,
  onTutorialHub,
}) {
  const { t } = useTranslation("workspace");
  const { t: tCommon } = useTranslation("common");
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);
  const step = tour?.steps?.[tour.index] || null;

  useEffect(() => {
    previousFocus.current = document.activeElement;
    dialogRef.current?.focus();
    return () => previousFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [tour?.index, tour?.summary]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (tour?.summary || !tour?.automatic) onClose();
        else onSkip();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onSkip, tour?.automatic, tour?.summary]);

  if (!tour) return null;

  if (tour.summary) {
    const summary = tutorialSummaryCopy(trial, {
      showTrialAnnouncement: Boolean(tour.showTrialAnnouncement),
    });
    return (
      <div className="tutorial-modal-backdrop" role="presentation">
        <section
          ref={dialogRef}
          className="tutorial-summary-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tutorial-summary-title"
          tabIndex={-1}
        >
          <span className="tutorial-complete-mark" aria-hidden="true">✓</span>
          <p className="tutorial-eyebrow">
            {tour.terminalStatus === "skipped" ? t("tutorialOverlay.tourSkipped") : t("tutorialOverlay.tourComplete")}
          </p>
          <h2 id="tutorial-summary-title">{summary.title}</h2>
          <div className={`tutorial-summary-grid${tour.showTrialAnnouncement ? "" : " is-single"}`}>
            <div>
              <strong>{t("tutorialOverlay.alwaysHereTitle")}</strong>
              <p>{t("tutorialOverlay.alwaysHereBody")}</p>
            </div>
            {tour.showTrialAnnouncement ? (
              <div>
                <strong>{summary.trialTitle}</strong>
                <p>{summary.trialBody}</p>
              </div>
            ) : null}
          </div>
          {error ? <p className="tutorial-error" role="alert">{error}</p> : null}
          <div className="tutorial-summary-actions">
            <button type="button" className="btn-secondary" onClick={onTutorialHub}>{t("tutorialOverlay.viewTutorials")}</button>
            <button type="button" className="btn-primary" onClick={onDashboard}>{t("tutorialOverlay.goToDashboard")}</button>
          </div>
        </section>
      </div>
    );
  }

  const anchored = Boolean(step?.target && targetStatus === "found" && targetRect);
  const position = anchored
    ? tutorialCardPosition(targetRect, { width: window.innerWidth, height: window.innerHeight })
    : null;

  return (
    <div className={`tutorial-layer${reducedMotion ? " is-reduced-motion" : ""}`}>
      {anchored ? (
        <div
          className="tutorial-spotlight"
          aria-hidden="true"
          style={{
            left: targetRect.left - 7,
            top: targetRect.top - 7,
            width: targetRect.width + 14,
            height: targetRect.height + 14,
          }}
        />
      ) : (
        <div className="tutorial-soft-backdrop" aria-hidden="true" />
      )}
      <section
        ref={dialogRef}
        className={`tutorial-card${anchored ? " is-anchored" : " is-centered"}`}
        style={position || undefined}
        role="dialog"
        aria-labelledby="tutorial-step-title"
        aria-describedby="tutorial-step-description"
        tabIndex={-1}
      >
        <div className="tutorial-progress-row">
          <span>{tour.module.title}</span>
          <span>{t("tutorialOverlay.progressOf", { current: tour.index + 1, total: tour.steps.length })}</span>
        </div>
        <div className="tutorial-progress-track" aria-hidden="true">
          <span style={{ width: `${((tour.index + 1) / tour.steps.length) * 100}%` }} />
        </div>
        <h2 id="tutorial-step-title">{step.title}</h2>
        <p id="tutorial-step-description">{step.description}</p>
        {targetStatus === "waiting" ? <p className="tutorial-target-note">{t("tutorialOverlay.preparingArea")}</p> : null}
        {targetStatus === "scrolling" ? <p className="tutorial-target-note">{t("tutorialOverlay.scrollingArea")}</p> : null}
        {step.target && targetStatus === "missing" ? (
          <p className="tutorial-target-note">{t("tutorialOverlay.missingTarget")}</p>
        ) : null}
        {error ? <p className="tutorial-error" role="alert">{error}</p> : null}
        <TutorialActions
          index={tour.index}
          total={tour.steps.length}
          automatic={tour.automatic}
          busy={busy}
          onBack={onBack}
          onNext={onNext}
          onSkip={onSkip}
          onClose={onClose}
          t={t}
          tCommon={tCommon}
        />
      </section>
    </div>
  );
}
