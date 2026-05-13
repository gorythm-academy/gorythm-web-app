import React from 'react';
import './OptimizedPicture.scss';

/**
 * Deliver raster images as AVIF → WebP → PNG/JPEG fallback.
 *
 * Why `<picture>`:
 * - The browser picks the first `<source>` type it understands (usually smallest transfer).
 * - The `<img>` URL remains the universal fallback for older engines / RSS / copy-image UX.
 *
 * Workflow:
 * - Keep authoring PNGs in `src/assets` as today.
 * - Run `npm run optimize-images` so `.webp` / `.avif` siblings exist beside each PNG you import here.
 *
 * Non-goals:
 * - Does not replace vector SVG.
 * - Does not resize art at runtime — resize/compress when exporting source PNGs too.
 *
 * @param {string} [props.avifSrc] – bundled URL from `import x from '…avif'`
 * @param {string} [props.webpSrc] – bundled URL from `import x from '…webp'`
 * @param {string} props.fallbackSrc – bundled URL from `import x from '…png'` (or jpeg)
 * @param {string} props.alt – required for accessibility (use "" for decorative)
 * @param {string} [props.pictureClassName] – class on `<picture>` wrapper
 */
export default function OptimizedPicture({
  avifSrc,
  webpSrc,
  fallbackSrc,
  alt,
  pictureClassName,
  ...imgProps
}) {
  return (
    <picture className={['optimized-picture', pictureClassName].filter(Boolean).join(' ')}>
      {/* Modern codecs first — order matters for negotiation */}
      {avifSrc ? <source srcSet={avifSrc} type="image/avif" /> : null}
      {webpSrc ? <source srcSet={webpSrc} type="image/webp" /> : null}
      <img src={fallbackSrc} alt={alt} {...imgProps} />
    </picture>
  );
}
