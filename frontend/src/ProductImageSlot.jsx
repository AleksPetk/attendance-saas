import { useOptionalPromoLocale } from "./promo/PromoLocaleContext.jsx";

/**
 * Reusable marketing screenshot slot.
 * Pass `image` later (same shape as home marketing assets). Until then, a branded
 * placeholder is shown — no fake product screenshots.
 * Prefer LocalizedPromoImage for locale-aware filled product shots; this slot still
 * hides EN UI screenshots on JA when no jaImage is provided.
 */
export default function ProductImageSlot({
  label,
  caption,
  image = null,
  jaImage = null,
  aspect = "16 / 10",
  className = "",
}) {
  const promo = useOptionalPromoLocale();
  const isJa = promo?.locale === "ja";
  const resolvedImage = isJa ? jaImage || null : image;
  const showJaSubtlePlaceholder = isJa && image && !jaImage;
  const showFilled = Boolean(resolvedImage);

  const productScreenshot =
    promo?.t("imageSlot.productScreenshot") || "Product screenshot";
  const comingSoonAria =
    promo?.t("imageSlot.comingSoonAria", { label }) ||
    `${label} screenshot coming soon`;
  const imagePlaceholder = promo?.t("imagePlaceholder") || "Image placeholder";

  if (showJaSubtlePlaceholder) {
    const classes = ["product-image-slot", "product-image-slot-filled", "promo-image-placeholder", className]
      .filter(Boolean)
      .join(" ");
    return (
      <figure
        className={classes}
        style={{ aspectRatio: aspect }}
        role="img"
        aria-label={label || imagePlaceholder}
      >
        <span className="promo-image-placeholder-inner">
          <span className="promo-image-placeholder-mark">{imagePlaceholder}</span>
        </span>
        {caption ? <figcaption className="product-image-slot-caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  const classes = [
    "product-image-slot",
    showFilled ? "product-image-slot-filled" : "product-image-slot-placeholder",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <figure className={classes} style={showFilled ? undefined : { aspectRatio: aspect }}>
      {showFilled ? (
        <picture>
          {resolvedImage.avifSrcSet ? (
            <source
              type="image/avif"
              srcSet={resolvedImage.avifSrcSet}
              sizes={resolvedImage.sizes}
            />
          ) : null}
          {resolvedImage.webpSrcSet ? (
            <source
              type="image/webp"
              srcSet={resolvedImage.webpSrcSet}
              sizes={resolvedImage.sizes}
            />
          ) : null}
          <img
            src={resolvedImage.fallbackSrc || resolvedImage.src}
            srcSet={resolvedImage.jpgSrcSet}
            sizes={resolvedImage.sizes}
            alt={resolvedImage.alt || label}
            width={resolvedImage.width}
            height={resolvedImage.height}
            loading="lazy"
            decoding="async"
            style={
              resolvedImage.objectPosition
                ? { objectPosition: resolvedImage.objectPosition }
                : undefined
            }
          />
        </picture>
      ) : (
        <div
          className="product-image-slot-frame"
          role="img"
          aria-label={comingSoonAria}
        >
          <span className="product-image-slot-chrome" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="product-image-slot-stage">
            <span className="product-image-slot-mark" aria-hidden="true" />
            <span className="product-image-slot-label">{label}</span>
            <span className="product-image-slot-hint">{productScreenshot}</span>
          </span>
        </div>
      )}
      {caption ? <figcaption className="product-image-slot-caption">{caption}</figcaption> : null}
    </figure>
  );
}
