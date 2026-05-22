import React from 'react';
import { BRAND_LOGO_AVIF, BRAND_LOGO_WEBP, BRAND_LOGO_PNG } from '../../config/publicAssets';

/** Header-sized logo (AVIF → WebP → PNG) from `public/images/brand/` — see `npm run optimize-images`. */
export default function BrandLogo({ className, alt = 'Gorythm Academy', width = 40, height = 40 }) {
  return (
    <picture>
      <source srcSet={BRAND_LOGO_AVIF} type="image/avif" />
      <source srcSet={BRAND_LOGO_WEBP} type="image/webp" />
      <img
        src={BRAND_LOGO_PNG}
        alt={alt}
        className={className}
        width={width}
        height={height}
        sizes={`${width}px`}
        decoding="async"
      />
    </picture>
  );
}
