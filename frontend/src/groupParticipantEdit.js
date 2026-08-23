export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Prefer keyboard focus on desktop-like pointers; avoid opening mobile keyboards. */
export function shouldAutofocusEditField() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
}

export function revealParticipantEditPanel(panel, focusInput) {
  if (!panel) {
    return;
  }
  panel.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
  if (!shouldAutofocusEditField() || !focusInput) {
    return;
  }
  const delay = prefersReducedMotion() ? 0 : 320;
  window.setTimeout(() => {
    focusInput.focus({ preventScroll: true });
  }, delay);
}
