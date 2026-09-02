import { shouldUsePromoImagePlaceholder } from "./locale.js";
import { usePromoLocale } from "./PromoLocaleContext.jsx";

export { shouldUsePromoImagePlaceholder };

/**
 * Locale-aware promotional image.
 * EN: existing product screenshot (picture/srcSet preserved).
 * JA: jaSrc/jaImage when available; otherwise same-slot subtle placeholder.
 * Pass `shared` to keep one asset across locales (illustrations / icons).
 */
export default function LocalizedPromoImage({
  enSrc,
  image = null,
  enImage = null,
  jaSrc = null,
  jaImage = null,
  alt = "",
  className = "",
  figureClassName = "",
  aspectRatio,
  width,
  height,
  objectPosition,
  loading = "lazy",
  sizes,
  caption = null,
  shared = false,
  as = "figure",
}) {
  const { locale, t } = usePromoLocale();
  const isJa = locale === "ja";

  const enAsset =
    enImage || image || (enSrc ? { src: enSrc, fallbackSrc: enSrc } : null);
  const jaAsset = jaImage || (jaSrc ? { src: jaSrc, fallbackSrc: jaSrc } : null);
  const asset = shared || !isJa ? enAsset : jaAsset;

  const resolvedAlt =
    typeof alt === "object" && alt
      ? alt[locale] || alt.en || ""
      : alt || (!isJa || shared || jaAsset ? enAsset?.alt : "") || asset?.alt || "";

  const w = width || asset?.width || enAsset?.width;
  const h = height || asset?.height || enAsset?.height;
  const ratio =
    aspectRatio ||
    (w && h ? `${w} / ${h}` : undefined) ||
    (enAsset?.width && enAsset?.height
      ? `${enAsset.width} / ${enAsset.height}`
      : "16 / 10");

  const Wrapper = as === "div" ? "div" : "figure";
  const wrapperClass = [figureClassName, className].filter(Boolean).join(" ");

  if (isJa && !shared && !asset) {
    return (
      <Wrapper
        className={`${wrapperClass} promo-image-placeholder`.trim()}
        style={{ aspectRatio: ratio }}
        role="img"
        aria-label={resolvedAlt || t("imagePlaceholder")}
      >
        <span className="promo-image-placeholder-inner">
          <span className="promo-image-placeholder-mark">{t("imagePlaceholder")}</span>
        </span>
        {caption ? <figcaption className="product-image-slot-caption">{caption}</figcaption> : null}
      </Wrapper>
    );
  }

  if (!asset) {
    return (
      <Wrapper
        className={`${wrapperClass} promo-image-placeholder`.trim()}
        style={{ aspectRatio: ratio }}
        role="img"
        aria-label={resolvedAlt || t("imagePlaceholder")}
      >
        <span className="promo-image-placeholder-inner">
          <span className="promo-image-placeholder-mark">{t("imagePlaceholder")}</span>
        </span>
        {caption ? <figcaption className="product-image-slot-caption">{caption}</figcaption> : null}
      </Wrapper>
    );
  }

  const fallback = asset.fallbackSrc || asset.src || asset.jpgSrcSet?.split(" ")[0];
  const pos = objectPosition || asset.objectPosition;

  return (
    <Wrapper className={wrapperClass || undefined}>
      <picture>
        {asset.avifSrcSet ? (
          <source type="image/avif" srcSet={asset.avifSrcSet} sizes={sizes || asset.sizes} />
        ) : null}
        {asset.webpSrcSet ? (
          <source type="image/webp" srcSet={asset.webpSrcSet} sizes={sizes || asset.sizes} />
        ) : null}
        <img
          src={fallback}
          srcSet={asset.jpgSrcSet || asset.srcSet}
          sizes={sizes || asset.sizes}
          alt={resolvedAlt}
          width={w}
          height={h}
          loading={loading}
          decoding="async"
          style={pos ? { objectPosition: pos } : undefined}
        />
      </picture>
      {caption ? <figcaption className="product-image-slot-caption">{caption}</figcaption> : null}
    </Wrapper>
  );
}
