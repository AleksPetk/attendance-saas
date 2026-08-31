export const TARGET_WAIT_MS = 2400;

export function tutorialTargetSelector(targetId) {
  if (!/^[a-z0-9-]+$/.test(targetId || "")) return "";
  return `[data-tutorial-target="${targetId}"]`;
}

export function tutorialTargetIsVisible(element, viewport = globalThis?.window) {
  if (!element?.getBoundingClientRect) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const width = viewport?.innerWidth ?? Number.POSITIVE_INFINITY;
  const height = viewport?.innerHeight ?? Number.POSITIVE_INFINITY;
  return rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height;
}

export function tutorialTargetCanBeRevealed(element, viewport = globalThis?.window) {
  if (!element?.getBoundingClientRect) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const width = viewport?.innerWidth ?? Number.POSITIVE_INFINITY;
  return rect.right > 0 && rect.left < width;
}

export function scrollTutorialTargetIntoView(
  element,
  {
    reducedMotion = false,
    requestFrame = globalThis?.requestAnimationFrame,
    maxFrames = 60,
    cancelled = () => false,
  } = {},
) {
  if (!element?.scrollIntoView || cancelled()) return Promise.resolve(false);
  element.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
  if (reducedMotion || typeof requestFrame !== "function") {
    return Promise.resolve(!cancelled());
  }
  return new Promise((resolve) => {
    let frameCount = 0;
    let stableFrames = 0;
    let previous = element.getBoundingClientRect();
    const measure = () => {
      if (cancelled() || !element.isConnected) {
        resolve(false);
        return;
      }
      frameCount += 1;
      const current = element.getBoundingClientRect();
      const movement = Math.abs(current.top - previous.top) + Math.abs(current.left - previous.left);
      stableFrames = frameCount > 2 && movement < 0.5 ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= 2 || frameCount >= maxFrames) {
        resolve(true);
        return;
      }
      requestFrame(measure);
    };
    requestFrame(measure);
  });
}

export function waitForTutorialTarget(
  targetId,
  {
    timeout = TARGET_WAIT_MS,
    root = globalThis?.document,
    Observer = globalThis?.MutationObserver,
    schedule = globalThis?.setTimeout,
    cancel = globalThis?.clearTimeout,
    viewport = globalThis?.window,
  } = {},
) {
  const selector = tutorialTargetSelector(targetId);
  if (!selector || !root?.querySelector) return Promise.resolve(null);
  const findRevealable = () => {
    const element = root.querySelector(selector);
    return tutorialTargetCanBeRevealed(element, viewport) ? element : null;
  };
  const immediate = findRevealable();
  if (immediate) return Promise.resolve(immediate);
  if (!Observer || !schedule) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (element) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      if (timer) cancel?.(timer);
      resolve(element || null);
    };
    const observer = new Observer(() => {
      const element = findRevealable();
      if (element) finish(element);
    });
    observer.observe(root.body || root.documentElement, { childList: true, subtree: true, attributes: true });
    timer = schedule(() => finish(null), timeout);
  });
}

export function tutorialRouteNeedsNavigation(currentPath, nextRoute) {
  return Boolean(nextRoute && currentPath !== nextRoute);
}

export function preferredTutorialGroup(groups) {
  if (!Array.isArray(groups)) return null;
  return groups.find((group) => group.status !== "archived" && !group.is_plan_locked) || null;
}
