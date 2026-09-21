/**
 * The Zappy professional — the homepage hero's figure.
 * ----------------------------------------------------------------------------
 * ── WHY THIS IS DRAWN AND NOT SOURCED ──────────────────────────────────────
 * The reference composition wants a friendly professional standing to the right
 * of the headline. The only 3D human asset in the repo is
 * `/public/promos/transp_pixar_worker.png`, and his cap reads "SP", his shirt
 * reads "SERVICE PRO" and his badge reads "BEN" — another company's uniform on
 * our own front page. He is also not who we say we send. So he is not used, and
 * this figure is drawn from scratch in the brand's own palette instead.
 *
 * ── BUILT TO BE REPLACED ───────────────────────────────────────────────────
 * This is a placeholder with a deliberately boring contract, because a photoreal
 * render is the real target. Drop a file at `HERO_RENDER_SRC`, flip
 * `HAS_HERO_RENDER` to true, and the hero swaps without a single layout change:
 * both branches fill the same box, share `object-contain` and the same bottom
 * alignment, so the figure's feet stay on the same line either way. The <img>
 * also falls back to the vector on a decode error, which matters because Vite's
 * dev server answers a missing asset with 200 + index.html rather than a 404 —
 * a missing render would otherwise render as a broken image, not as nothing.
 *
 * Everything here is decorative: the hero's meaning lives in its text, so this
 * carries `aria-hidden` and no alt text to announce.
 * ----------------------------------------------------------------------------
 */

export const HERO_RENDER_SRC = '/assets/hero/zappy-pro.png';

/**
 * No render exists yet. An explicit flag rather than a probe, for the dev-server
 * reason above — you cannot ask the server whether the file is there.
 */
export const HAS_HERO_RENDER = false;

/* Palette — warm mid-brown skin, Zappy indigo/blue uniform. */
const SKIN       = '#C08457';
const SKIN_SHADE = '#A66C43';
const HAIR       = '#221C2E';
const SHIRT      = '#2F5FD0';
const SHIRT_DARK = '#2247A8';
const SHIRT_LIT  = '#4A79E4';
const TROUSER    = '#24365F';
const TROUSER_D  = '#1B2A4B';
const CAP        = '#2247A8';
const CAP_LIT    = '#3463CE';

function ProVector({ className = '' }) {
  return (
    <svg
      viewBox="0 0 240 330"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* Contact shadow — grounds the figure so it does not float in the card. */}
      <ellipse cx="120" cy="315" rx="60" ry="9" fill="rgba(15,23,42,0.13)" />

      {/* ── Legs ─────────────────────────────────────────────────────────── */}
      <path d="M97 200h20v96a10 10 0 0 1-20 0z" fill={TROUSER} />
      <path d="M123 200h20v96a10 10 0 0 1-20 0z" fill={TROUSER_D} />
      {/* Shoes */}
      <path d="M91 296h26v10a6 6 0 0 1-6 6H91a6 6 0 0 1 0-16z" fill="#1A1A22" />
      <path d="M123 296h26a6 6 0 0 1 0 16h-20a6 6 0 0 1-6-6z" fill="#13131A" />

      {/* ── Torso ────────────────────────────────────────────────────────── */}
      {/* Shirt body: broad shoulders tapering to the waist. */}
      <path
        d="M120 106c-16 0-30 3-40 8-12 6-18 16-19 29l-4 44c-1 10 4 16 14 17 14 2 31 3 49 3s35-1 49-3c10-1 15-7 14-17l-4-44c-1-13-7-23-19-29-10-5-24-8-40-8z"
        fill={SHIRT}
      />
      {/* Light falling from the upper left. */}
      <path
        d="M120 106c-16 0-30 3-40 8-12 6-18 16-19 29l-4 44c-1 10 4 16 14 17 6 1 13 2 20 2V106z"
        fill={SHIRT_LIT}
        opacity="0.5"
      />
      {/* Sleeve shadow where the arm meets the body. */}
      <path d="M77 120c-9 6-14 15-15 27l-2 24 16 2 6-53z" fill={SHIRT_DARK} opacity="0.35" />
      <path d="M163 120c9 6 14 15 15 27l2 24-16 2-6-53z" fill={SHIRT_DARK} opacity="0.5" />

      {/* Collar */}
      <path d="M104 107l16 16 16-16-8-5h-16z" fill="#F4F6FB" />
      <path d="M120 123l-16-16-6 4 18 20z" fill={SHIRT_DARK} />
      <path d="M120 123l16-16 6 4-18 20z" fill={SHIRT_DARK} />
      {/* Placket + buttons */}
      <rect x="117" y="131" width="6" height="52" rx="3" fill={SHIRT_DARK} opacity="0.45" />
      <circle cx="120" cy="146" r="2" fill="#F4F6FB" opacity="0.85" />
      <circle cx="120" cy="164" r="2" fill="#F4F6FB" opacity="0.85" />
      {/* Chest pocket */}
      <path d="M84 140h20v16H84z" fill={SHIRT_DARK} opacity="0.3" />
      {/* Our own wordmark — this uniform is Zappy's. */}
      <text
        x="152"
        y="150"
        textAnchor="middle"
        fontFamily="Poppins, system-ui, sans-serif"
        fontSize="11"
        fontWeight="800"
        fill="#FFFFFF"
        opacity="0.9"
      >
        Zappy
      </text>

      {/* ── Folded arms ──────────────────────────────────────────────────── */}
      {/* Short sleeves */}
      <path d="M72 116c-9 5-14 14-15 25l-1 14 26 3 4-40z" fill={SHIRT} />
      <path d="M168 116c9 5 14 14 15 25l1 14-26 3-4-40z" fill={SHIRT_DARK} />

      {/* Lower forearm crossing in front (the arm nearer the viewer). */}
      <path d="M62 176c0-8 7-14 16-14h84c9 0 16 6 16 14s-7 14-16 14H78c-9 0-16-6-16-14z" fill={SKIN} />
      {/* Upper forearm crossing behind it. */}
      <path d="M66 160c0-8 7-13 15-13h78c8 0 15 5 15 13s-7 13-15 13H81c-8 0-15-5-15-13z" fill={SKIN_SHADE} />
      <path d="M66 160c0-8 7-13 15-13h78c8 0 15 5 15 13H66z" fill={SKIN} opacity="0.55" />
      {/* Hands resting on the opposite elbow. */}
      <path d="M154 150c9 0 16 5 16 11s-7 12-16 12h-8v-23z" fill={SKIN} />
      <path d="M86 164c-9 0-16 6-16 12s7 12 16 12h8v-24z" fill={SKIN} />
      {/* Wristwatch — one small human detail so the pose is not two plain bars. */}
      <rect x="98" y="170" width="9" height="13" rx="3" fill="#E8EDF7" />
      <rect x="99.5" y="172" width="6" height="9" rx="2" fill="#94A3B8" />

      {/* ── Neck ─────────────────────────────────────────────────────────── */}
      <path d="M108 84h24v24a12 12 0 0 1-24 0z" fill={SKIN_SHADE} />

      {/* ── Head ─────────────────────────────────────────────────────────── */}
      <ellipse cx="120" cy="66" rx="30" ry="33" fill={SKIN} />
      {/* Jaw shading on the light-away side. */}
      <path d="M140 42c6 6 10 15 10 24 0 18-13 33-30 33 22 0 30-19 30-36 0-8-4-16-10-21z" fill={SKIN_SHADE} opacity="0.5" />
      {/* Ears */}
      <ellipse cx="91" cy="68" rx="6" ry="8" fill={SKIN_SHADE} />
      <ellipse cx="149" cy="68" rx="6" ry="8" fill={SKIN_SHADE} />

      {/* Sideburns / hair at the temples, below the cap line. */}
      <path d="M92 52c-2 8-2 16 0 23 3-6 4-14 4-21z" fill={HAIR} />
      <path d="M148 52c2 8 2 16 0 23-3-6-4-14-4-21z" fill={HAIR} />

      {/* Brows */}
      <path d="M103 58c4-3 10-3 13 0" stroke={HAIR} strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <path d="M124 58c3-3 9-3 13 0" stroke={HAIR} strokeWidth="3.4" strokeLinecap="round" fill="none" />
      {/* Eyes */}
      <ellipse cx="109" cy="68" rx="3.6" ry="4.2" fill="#2B2130" />
      <ellipse cx="131" cy="68" rx="3.6" ry="4.2" fill="#2B2130" />
      <circle cx="110.4" cy="66.6" r="1.3" fill="#FFFFFF" opacity="0.9" />
      <circle cx="132.4" cy="66.6" r="1.3" fill="#FFFFFF" opacity="0.9" />
      {/* Nose */}
      <path d="M120 72c-2 4-3 6-1 7h3" stroke={SKIN_SHADE} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Smile */}
      <path d="M111 84c5 5 13 5 18 0" stroke="#8A4B33" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* ── Cap ──────────────────────────────────────────────────────────── */}
      <path d="M120 24c-17 0-30 12-31 27 0 3 2 4 5 4h52c3 0 5-1 5-4-1-15-14-27-31-27z" fill={CAP} />
      <path d="M120 24c-12 0-22 6-27 15 6-6 15-10 24-10 4 0 7 0 10 1-2-4-4-6-7-6z" fill={CAP_LIT} opacity="0.75" />
      {/* Brim */}
      <path d="M88 55h64c9 0 16 4 16 8 0 3-4 4-10 4H86c-6 0-10-1-10-4 0-4 5-8 12-8z" fill={CAP_LIT} />
      <path d="M88 55h64c9 0 16 4 16 8H76c0-4 5-8 12-8z" fill={CAP} opacity="0.55" />
      {/* Zappy mark on the cap — a bolt, not initials. */}
      <path d="M122 32l-9 11h6l-3 9 10-12h-6z" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * The hero figure.
 *
 * `className` sizes the box; the artwork fills it and is bottom-aligned, so the
 * vector and a future render occupy the same footprint.
 */
export default function ZappyPro({ className = '' }) {
  if (HAS_HERO_RENDER) {
    return (
      <img
        src={HERO_RENDER_SRC}
        alt=""
        aria-hidden="true"
        className={`${className} object-contain object-bottom`}
        onError={(e) => {
          // The render is missing or unreadable — fall back rather than leave a
          // broken frame in the hero.
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  }
  return <ProVector className={className} />;
}
