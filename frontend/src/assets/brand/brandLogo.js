/* Optimized brand assets — masters remain in original_assets/. */
import logoTextAvif from "./logo-text.avif";
import logoTextWebp from "./logo-text.webp";
import logoTextPng from "./logo-text.png";
import logoMarkAvif from "./logo-mark.avif";
import logoMarkWebp from "./logo-mark.webp";
import logoMarkPng from "./logo-mark.png";

export const brandLogoText = {
  alt: "Check Station",
  width: 720,
  height: 240,
  avifSrc: logoTextAvif,
  webpSrc: logoTextWebp,
  pngSrc: logoTextPng,
};

/** Compact mark for footer copyright row (from original_assets/logo.png). */
export const brandLogoMark = {
  alt: "",
  width: 64,
  height: 64,
  avifSrc: logoMarkAvif,
  webpSrc: logoMarkWebp,
  pngSrc: logoMarkPng,
};
