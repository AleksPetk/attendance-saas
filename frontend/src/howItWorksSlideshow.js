export const HOW_IT_WORKS_SLIDESHOW_INTERVAL_MS = 5000;

export function nextSlideshowIndex(currentIndex, slideCount, direction = 1) {
  if (!slideCount) return 0;
  return (currentIndex + direction + slideCount) % slideCount;
}

export function shouldRunSlideshow({
  inViewport,
  interacting,
  reducedMotion,
  pageVisible,
}) {
  return Boolean(inViewport && !interacting && !reducedMotion && pageVisible);
}
