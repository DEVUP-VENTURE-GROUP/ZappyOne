import { useState } from 'react';

/**
 * A brand's mark, resolved in three tiers.
 *
 *   1. A local asset in `src/assets/brands/<code>.(svg|png|webp)`.
 *      Collected at build time with `import.meta.glob`, so dropping a file in
 *      that folder wires it up with no code change and — unlike probing
 *      `/images/brands/…` at runtime — costs zero 404s for brands without one.
 *   2. The admin-managed `logoUrl` on the Brand document, when it actually
 *      looks like a logo asset (see `isLogoAsset`).
 *   3. A clean typographic wordmark of the brand's name.
 *
 * Why tier 2 is filtered: the seeded catalog currently points every `logoUrl`
 * at an Unsplash stock *photo of a phone*, not a brand mark. Rendering those
 * would put a random handset picture on the "Apple" tile — worse than no logo,
 * and misleading as a brand identifier. Real logo URLs (or local assets) take
 * over automatically the moment they're set, and this filter can be deleted
 * once the seed data is fixed.
 */

// Vite resolves this glob at build time; a missing folder yields {}.
const localAssets = import.meta.glob('../../assets/brands/*.{svg,png,webp}', {
  eager: true,
  import: 'default',
});

const LOCAL_BY_CODE = Object.entries(localAssets).reduce((map, [path, url]) => {
  const code = path.split('/').pop().replace(/\.(svg|png|webp)$/, '');
  map[code] = url;
  return map;
}, {});

// Stock-photo hosts seeded as placeholders — never a brand mark.
const STOCK_HOSTS = ['images.unsplash.com', 'source.unsplash.com', 'picsum.photos'];

function isLogoAsset(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url, window.location.origin);
    return !STOCK_HOSTS.some((host) => hostname.endsWith(host));
  } catch {
    return false;
  }
}

/** Longer names need to step down a size to stay on one line. */
function wordmarkClass(name) {
  const len = name.length;
  if (len <= 4) return 'text-[19px] tracking-tight';
  if (len <= 8) return 'text-[15px] tracking-tight';
  if (len <= 12) return 'text-[12.5px] tracking-tight';
  return 'text-[11px] tracking-tight';
}

export default function BrandLogo({ brand, className = '' }) {
  const local = LOCAL_BY_CODE[brand.code];
  const remote = isLogoAsset(brand.logoUrl) ? brand.logoUrl : null;
  const [failed, setFailed] = useState(false);

  const src = failed ? null : local || remote;

  if (!src) {
    return (
      <span
        className={`flex h-full w-full items-center justify-center px-1 text-center font-black text-navy-900 ${wordmarkClass(
          brand.name,
        )} ${className}`}
      >
        {brand.name}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`h-full w-full object-contain ${className}`}
    />
  );
}
