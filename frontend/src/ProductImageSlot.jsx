/**
 * Reusable marketing screenshot slot.
 * Pass `image` later (same shape as home marketing assets). Until then, a branded
 * placeholder is shown — no fake product screenshots.
 */
export default function ProductImageSlot({
  label,
  caption,
  image = null,
  aspect = "16 / 10",
  className = "",
}) {
  const classes = [
    "product-image-slot",
    image ? "product-image-slot-filled" : "product-image-slot-placeholder",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <figure className={classes} style={image ? undefined : { aspectRatio: aspect }}>
      {image ? (
        <picture>
          {image.avifSrcSet ? (
            <source type="image/avif" srcSet={image.avifSrcSet} sizes={image.sizes} />
          ) : null}
          {image.webpSrcSet ? (
            <source type="image/webp" srcSet={image.webpSrcSet} sizes={image.sizes} />
          ) : null}
          <img
            src={image.fallbackSrc}
            srcSet={image.jpgSrcSet}
            sizes={image.sizes}
            alt={image.alt || label}
            width={image.width}
            height={image.height}
            loading="lazy"
            decoding="async"
            style={image.objectPosition ? { objectPosition: image.objectPosition } : undefined}
          />
        </picture>
      ) : (
        <div
          className="product-image-slot-frame"
          role="img"
          aria-label={`${label} screenshot coming soon`}
        >
          <span className="product-image-slot-chrome" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="product-image-slot-stage">
            <span className="product-image-slot-mark" aria-hidden="true" />
            <span className="product-image-slot-label">{label}</span>
            <span className="product-image-slot-hint">Product screenshot</span>
          </span>
        </div>
      )}
      {caption ? <figcaption className="product-image-slot-caption">{caption}</figcaption> : null}
    </figure>
  );
}
