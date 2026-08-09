import { memo } from 'react';
import { GENERIC_ILLUSTRATION_RULES } from '../../constants/catalogCategories';

/**
 * Zappy service illustrations.
 *
 * Filled, scene-style vector art — a subject built from solid shapes under a
 * warm spotlight, not a line icon. One drawing language across every vertical:
 * no emojis, no borrowed icon fonts, no per-page icon sets.
 *
 * Palette (four inks, no more):
 *   --ill-body  the subject's main mass — the category accent
 *   --ill-ink   structure, wheels, outlines — the category's deep shade
 *   --ill-tint  secondary mass / props
 *   --ill-pale  highlights and glass
 *   plus a fixed amber spotlight, which is the one warm note in the system.
 *
 * The first three are set per category by `themeVars()`, so the identical
 * drawing reads blue on Car Services, teal on Cleaning and violet on Phone
 * Repair without a second asset.
 *
 * Inline SVG throughout: no network request, no layout shift, crisp at any
 * density, and themeable without a sprite sheet. The spotlight is drawn as two
 * stacked translucent triangles rather than an SVG gradient, so there are no
 * `<defs>` ids to collide when 30 of these render on one screen.
 */

const INK = 'var(--ill-ink, #1E3A8A)';
const BODY = 'var(--ill-body, #2563EB)';
const TINT = 'var(--ill-tint, #DBEAFE)';
const PALE = 'var(--ill-pale, #EFF6FF)';
const WARM = '#F59E0B';
const WHITE = '#FFFFFF';

/* ── Shared pieces ────────────────────────────────────────────────────────── */

/** The warm cone behind every subject — the signature of the set. */
function Spotlight() {
  return (
    <g aria-hidden>
      <path d="M32 2 60 46H4Z" fill={WARM} opacity="0.10" />
      <path d="M32 6 51 46H13Z" fill={WARM} opacity="0.13" />
    </g>
  );
}

function Ground({ y = 50, w = 22, opacity = 0.12 }) {
  return <ellipse cx="32" cy={y} rx={w} ry="2.6" fill={INK} opacity={opacity} />;
}

/**
 * Side-profile car, filled. Reused across the automotive set so every car-based
 * drawing is unmistakably the same vehicle.
 */
function Car({ x = 0, y = 0, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M4 40v-6.3c0-1.9 1.3-3.5 3.1-4l8.6-2 4.8-6.2A6 6 0 0 1 25.2 19h13.6a6 6 0 0 1 4.7 2.3l4.9 6.4 8.5 2c1.8.5 3.1 2.1 3.1 4V40a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
        fill={BODY}
      />
      <path d="M21.5 27.5h9v-6.2h-3.4a2 2 0 0 0-1.6.8Z" fill={PALE} />
      <path d="M33.5 21.3h4.9a2 2 0 0 1 1.6.8l4.2 5.4h-10.7Z" fill={PALE} />
      <rect x="4" y="33" width="10" height="3.4" rx="1.7" fill={WHITE} opacity="0.35" />
      <circle cx="18" cy="42" r="6.4" fill={INK} />
      <circle cx="46" cy="42" r="6.4" fill={INK} />
      <circle cx="18" cy="42" r="2.5" fill={PALE} />
      <circle cx="46" cy="42" r="2.5" fill={PALE} />
    </g>
  );
}

function Tyre({ cx, cy, r = 15 }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={INK} />
      <circle cx={cx} cy={cy} r={r * 0.58} fill={PALE} />
      <circle cx={cx} cy={cy} r={r * 0.22} fill={BODY} />
      <g fill={WHITE} opacity="0.35">
        <rect x={cx - 1.4} y={cy - r} width="2.8" height="4" rx="1.4" />
        <rect x={cx - 1.4} y={cy + r - 4} width="2.8" height="4" rx="1.4" />
        <rect x={cx - r} y={cy - 1.4} width="4" height="2.8" rx="1.4" />
        <rect x={cx + r - 4} y={cy - 1.4} width="4" height="2.8" rx="1.4" />
      </g>
    </g>
  );
}

function Snowflake({ x, y, s = 1, color = WHITE }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
    >
      <path d="M0-7V7M-6-3.5 6 3.5M-6 3.5 6-3.5" />
      <path d="M-2.2-4.4 0-6.6l2.2 2.2M-2.2 4.4 0 6.6l2.2-2.2" />
    </g>
  );
}

function Sparkle({ x, y, s = 1, color = WARM }) {
  return (
    <path
      d="M0-5.5C.7-2.3 1.6-1.4 4.8-.7v.2C1.6.2.7 1.1 0 4.3h-.2c-.7-3.2-1.6-4.1-4.8-4.8v-.2c3.2-.7 4.1-1.6 4.8-4.8Z"
      fill={color}
      transform={`translate(${x} ${y}) scale(${s})`}
    />
  );
}

function Drop({ x, y, s = 1, color = BODY }) {
  return (
    <path
      d="M0 0c2.7 3 4.2 5 4.2 6.7a4.2 4.2 0 0 1-8.4 0C-4.2 5-2.7 3 0 0Z"
      fill={color}
      transform={`translate(${x} ${y}) scale(${s})`}
    />
  );
}

function Bolt({ x, y, s = 1, color = WARM }) {
  return (
    <path
      d="M1-9-7 2h5l-2 8L9-1H3l3-8Z"
      fill={color}
      transform={`translate(${x} ${y}) scale(${s})`}
    />
  );
}

function Spanner({ x, y, rotate = 0, s = 1, color = INK }) {
  return (
    <path
      d="M8.6-9.4a6.4 6.4 0 0 0-8.3 8.2l-11 11 2.9 2.9 11-11a6.4 6.4 0 0 0 8.2-8.3L7.6-3.4 4-4.3 3.1-7.9Z"
      fill={color}
      transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s})`}
    />
  );
}

/* ── The set ──────────────────────────────────────────────────────────────── */

const DRAWINGS = {
  /* ─────────── Automotive ─────────── */

  'periodic-service': () => (
    <>
      <Ground />
      <Car x={-2} y={-4} s={0.92} />
      <g transform="translate(24 6)">
        <rect x="0" y="2" width="30" height="27" rx="4" fill={WHITE} />
        <rect x="0" y="2" width="30" height="27" rx="4" fill="none" stroke={INK} strokeWidth="2.4" />
        <rect x="0" y="2" width="30" height="7" rx="4" fill={INK} />
        <rect x="0" y="6" width="30" height="3" fill={INK} />
        <rect x="6" y="0" width="3" height="6" rx="1.5" fill={INK} />
        <rect x="21" y="0" width="3" height="6" rx="1.5" fill={INK} />
        <g fill={BODY}>
          <rect x="5" y="13" width="4" height="4" rx="1" />
          <rect x="13" y="13" width="4" height="4" rx="1" />
          <rect x="21" y="13" width="4" height="4" rx="1" />
          <rect x="5" y="20" width="4" height="4" rx="1" />
          <rect x="13" y="20" width="4" height="4" rx="1" opacity="0.45" />
          <rect x="21" y="20" width="4" height="4" rx="1" opacity="0.45" />
        </g>
      </g>
    </>
  ),

  'car-ac': () => (
    <>
      <Ground />
      <Car y={-2} s={0.94} />
      <g transform="translate(44 4)">
        <rect x="0" y="0" width="11" height="26" rx="5.5" fill={WHITE} />
        <rect x="0" y="0" width="11" height="26" rx="5.5" fill="none" stroke={INK} strokeWidth="2.2" />
        <rect x="3.5" y="5" width="4" height="14" rx="2" fill={BODY} />
        <circle cx="5.5" cy="21" r="4.5" fill={BODY} />
      </g>
      <circle cx="17" cy="12" r="10" fill={BODY} />
      <Snowflake x={17} y={12} s={1.05} />
    </>
  ),

  'ac-gas': () => (
    <>
      <Ground y={52} w={14} />
      <rect x="14" y="16" width="20" height="36" rx="9" fill={BODY} />
      <rect x="18" y="22" width="5" height="18" rx="2.5" fill={WHITE} opacity="0.35" />
      <rect x="19" y="8" width="10" height="9" rx="3" fill={INK} />
      <rect x="21.5" y="4" width="5" height="6" rx="2.5" fill={INK} />
      <path
        d="M34 26h8a7 7 0 0 1 7 7v7"
        fill="none"
        stroke={INK}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="49" cy="46" r="9" fill={TINT} />
      <Snowflake x={49} y={46} s={0.9} color={INK} />
    </>
  ),

  battery: () => (
    <>
      <Ground />
      <rect x="8" y="18" width="48" height="28" rx="6" fill={BODY} />
      <rect x="8" y="18" width="48" height="8" rx="6" fill={INK} opacity="0.25" />
      <rect x="16" y="12" width="9" height="7" rx="2" fill={INK} />
      <rect x="39" y="12" width="9" height="7" rx="2" fill={INK} />
      <g fill={WHITE}>
        <rect x="16" y="31" width="11" height="3" rx="1.5" />
        <rect x="20" y="27" width="3" height="11" rx="1.5" />
        <rect x="37" y="31" width="11" height="3" rx="1.5" />
      </g>
      <Bolt x={32} y={34} s={0.85} />
    </>
  ),

  tyre: () => (
    <>
      <Tyre cx={27} cy={26} r={17} />
      {/* Cradling hand, as in a tyre-care mark. */}
      <path
        d="M8 46h34a5 5 0 0 0 0-10H23l-9-5-4 4 5 4H8a3 3 0 0 0 0 7Z"
        fill={TINT}
      />
      <path d="M8 46h34a5 5 0 0 0 0-10H23" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <Sparkle x={49} y={13} s={0.9} />
    </>
  ),

  'wheel-align': () => (
    <>
      <Ground />
      <Tyre cx={24} cy={28} r={15} />
      <g stroke={BODY} strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M48 10v36" strokeDasharray="5 5" />
        <path d="M42 20l7 8-7 8" />
      </g>
      <rect x="6" y="47" width="52" height="3" rx="1.5" fill={INK} opacity="0.5" />
    </>
  ),

  'wheel-balance': () => (
    <>
      <Tyre cx={32} cy={26} r={16} />
      <rect x="43" y="14" width="8" height="8" rx="2.5" fill={WARM} />
      <rect x="13" y="30" width="8" height="8" rx="2.5" fill={WARM} />
      <rect x="29" y="44" width="6" height="8" rx="2" fill={INK} />
      <rect x="18" y="50" width="28" height="4" rx="2" fill={INK} />
    </>
  ),

  'car-wash': () => (
    <>
      <Ground />
      <Car y={-1} s={0.94} />
      <g>
        <Drop x={12} y={4} s={0.85} />
        <Drop x={26} y={1} s={1} />
        <Drop x={41} y={4} s={0.85} />
        <Drop x={53} y={9} s={0.7} />
      </g>
      <Sparkle x={50} y={22} s={0.8} color={WHITE} />
    </>
  ),

  'foam-wash': () => (
    <>
      <g fill={TINT}>
        <circle cx="14" cy="16" r="8" />
        <circle cx="9" cy="29" r="5.5" />
        <circle cx="17" cy="38" r="7" />
        <circle cx="7" cy="42" r="4" />
      </g>
      <g transform="translate(30 18)">
        <path d="M10 4h14a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5H10Z" fill={BODY} />
        <path d="M10 8H1L-7 3v18l8-5h9Z" fill={INK} />
        <rect x="12" y="23" width="6" height="10" rx="2" fill={INK} />
      </g>
      <Ground y={52} w={16} />
    </>
  ),

  'interior-clean': () => (
    <>
      <Ground />
      <path d="M12 48V26a8 8 0 0 1 8-8h3a7 7 0 0 1 7 7v23Z" fill={BODY} />
      <path d="M30 48h13a5 5 0 0 0 5-5V30" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M40 22h16l-5 12H45Z" fill={INK} />
      <rect x="46" y="10" width="4" height="13" rx="2" fill={INK} />
      <Sparkle x={21} y={31} s={0.95} color={WHITE} />
    </>
  ),

  ceramic: () => (
    <>
      <Ground />
      <Car y={-1} s={0.9} />
      <g transform="translate(38 2)">
        <path d="M11 0l11 4v9c0 6.4-4.6 11-11 12.6C4.6 24 0 19.4 0 13V4Z" fill={WARM} />
        <path
          d="M5.5 12.6l3.8 3.8L17 8.6"
          fill="none"
          stroke={WHITE}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </>
  ),

  detailing: () => (
    <>
      <Ground />
      <Car y={-1} s={0.94} />
      <Sparkle x={11} y={11} s={1.15} />
      <Sparkle x={31} y={5} s={0.85} />
      <Sparkle x={54} y={15} s={1} />
    </>
  ),

  scratch: () => (
    <>
      <rect x="4" y="14" width="38" height="32" rx="6" fill={BODY} />
      <rect x="9" y="19" width="12" height="6" rx="3" fill={WHITE} opacity="0.3" />
      <path
        d="M11 40c6-9 12-14 20-18"
        fill="none"
        stroke={WARM}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M15 43c5-6 9-10 14-13" fill="none" stroke={WARM} strokeWidth="2" strokeLinecap="round" opacity=".6" />
      <circle cx="48" cy="38" r="11" fill={INK} />
      <circle cx="48" cy="38" r="5" fill={PALE} />
      <rect x="46" y="16" width="4" height="12" rx="2" fill={INK} />
      <Ground y={52} />
    </>
  ),

  dent: () => (
    <>
      <path d="M4 16h42a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H4Z" fill={BODY} />
      <path d="M16 32c4-6 11-6 15 0s-4 11-9 6.6S20 26 16 32Z" fill={PALE} />
      <g transform="translate(40 22)">
        <rect x="0" y="8" width="16" height="4" rx="2" fill={INK} />
        <rect x="6" y="0" width="4" height="20" rx="2" fill={INK} />
      </g>
      <Ground y={52} />
    </>
  ),

  paint: () => (
    <>
      {/* Door panel being sprayed — the subject of the job. */}
      <path d="M38 20h18a4 4 0 0 1 4 4v22H38Z" fill={TINT} />
      <rect x="42" y="26" width="12" height="7" rx="3" fill={PALE} />
      <g transform="translate(6 12)">
        <path d="M12 10h8V4h7v6h4a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-4v16h-7V24h-8Z" fill={INK} />
        <path d="M12 14H5a4 4 0 0 0-4 4v3" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        <rect x="20" y="0" width="7" height="6" rx="1.5" fill={BODY} />
      </g>
      <g fill={BODY} opacity="0.75">
        <circle cx="38" cy="21" r="2.4" />
        <circle cx="35" cy="30" r="1.8" />
        <circle cx="37" cy="38" r="2.1" />
      </g>
      <Ground y={52} />
    </>
  ),

  windshield: () => (
    <>
      <path d="M11 44 19 17a5 5 0 0 1 4.8-3.6h16.4A5 5 0 0 1 45 17l8 27Z" fill={PALE} />
      <path
        d="M11 44 19 17a5 5 0 0 1 4.8-3.6h16.4A5 5 0 0 1 45 17l8 27Z"
        fill="none"
        stroke={BODY}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M31 19l-3.5 9 6.5 3-4.5 10"
        fill="none"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Sparkle x={44} y={24} s={0.8} />
      <rect x="6" y="47" width="52" height="4" rx="2" fill={INK} opacity="0.5" />
    </>
  ),

  headlight: () => (
    <>
      <path d="M8 20h14c9 0 16 5.4 16 12s-7 12-16 12H8Z" fill={BODY} />
      <circle cx="21" cy="32" r="7" fill={WARM} />
      <circle cx="21" cy="32" r="3" fill={WHITE} />
      <g stroke={WARM} strokeWidth="3" strokeLinecap="round">
        <path d="M44 21l10-4M44 32h13M44 43l10 4" />
      </g>
      <Ground y={50} />
    </>
  ),

  brake: () => (
    <>
      <circle cx="28" cy="30" r="19" fill={INK} />
      <circle cx="28" cy="30" r="13" fill={BODY} />
      <circle cx="28" cy="30" r="6" fill={PALE} />
      <g fill={WHITE} opacity="0.3">
        <rect x="26.6" y="11" width="2.8" height="5" rx="1.4" />
        <rect x="26.6" y="44" width="2.8" height="5" rx="1.4" />
        <rect x="9" y="28.6" width="5" height="2.8" rx="1.4" />
        <rect x="42" y="28.6" width="5" height="2.8" rx="1.4" />
      </g>
      <path d="M45 17a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6Z" fill={WARM} />
    </>
  ),

  suspension: () => (
    <>
      <rect x="25" y="4" width="14" height="6" rx="3" fill={INK} />
      <rect x="25" y="52" width="14" height="6" rx="3" fill={INK} />
      <rect x="29.5" y="9" width="5" height="7" rx="2.5" fill={INK} />
      <rect x="29.5" y="47" width="5" height="6" rx="2.5" fill={INK} />
      <path
        d="M20 18h24l-24 6h24l-24 6h24l-24 6h24l-24 6h24"
        fill="none"
        stroke={BODY}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Spanner x={53} y={44} rotate={-30} s={0.7} />
    </>
  ),

  engine: () => (
    <>
      <Ground />
      <path d="M12 24h8v-6h13v6h8l6 6h6v14a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4Z" fill={BODY} />
      <path d="M12 33H5v9h7Z" fill={INK} />
      <circle cx="42" cy="40" r="6" fill={INK} />
      <circle cx="42" cy="40" r="2.4" fill={PALE} />
      <rect x="21" y="20" width="10" height="4" rx="2" fill={WHITE} opacity="0.35" />
      <g stroke={WARM} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M24 12c0 3-4 3-4 6M33 9c0 3-4 3-4 6" />
      </g>
    </>
  ),

  oil: () => (
    <>
      <Ground />
      <path d="M8 28h20l9-7v7h6a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5Z" fill={BODY} />
      <path d="M47 33h8l-5-13" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <rect x="18" y="20" width="10" height="4" rx="2" fill={INK} />
      <Drop x={53} y={36} s={1.05} color={WARM} />
    </>
  ),

  insurance: () => (
    <>
      <path d="M32 4l22 7.6v17.6C54 43 44.8 51 32 55.2 19.2 51 10 43 10 29.2V11.6Z" fill={BODY} />
      <g transform="translate(6 14)">
        <Car s={0.78} y={-4} />
      </g>
      <circle cx="45" cy="43" r="11" fill={WARM} />
      <path
        d="M40 43l3.6 3.6L51 39"
        fill="none"
        stroke={WHITE}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),

  towing: () => (
    <>
      <Ground />
      <Car x={-8} y={-1} s={0.8} />
      <g transform="translate(34 8)">
        <path d="M2 12h6l14-8v6l-14 8Z" fill={INK} />
        <rect x="0" y="10" width="5" height="18" rx="2" fill={INK} />
        <path d="M18 22a5 5 0 1 0 10 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </g>
    </>
  ),

  fuel: () => (
    <>
      <Ground y={52} w={16} />
      <path d="M16 14a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v38H16Z" fill={BODY} />
      <rect x="21" y="15" width="14" height="10" rx="3" fill={PALE} />
      <path
        d="M40 20h6a4 4 0 0 1 4 4v14a4 4 0 0 0 4 4"
        fill="none"
        stroke={INK}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Drop x={28} y={32} s={0.9} color={WARM} />
    </>
  ),

  roadside: () => (
    <>
      <Ground />
      <Car x={-7} y={-1} s={0.82} />
      <g transform="translate(30 6)">
        <path d="M14 0 28 26H0Z" fill={WARM} />
        <rect x="12" y="9" width="4" height="9" rx="2" fill={WHITE} />
        <circle cx="14" cy="21.5" r="2.2" fill={WHITE} />
      </g>
    </>
  ),

  jumpstart: () => (
    <>
      <Ground y={52} />
      <rect x="4" y="24" width="30" height="24" rx="5" fill={BODY} />
      <rect x="10" y="18" width="7" height="7" rx="2" fill={INK} />
      <rect x="22" y="18" width="7" height="7" rx="2" fill={INK} />
      <g fill={WHITE}>
        <rect x="9" y="35" width="9" height="3" rx="1.5" />
        <rect x="12" y="32" width="3" height="9" rx="1.5" />
        <rect x="22" y="35" width="9" height="3" rx="1.5" />
      </g>
      <path
        d="M34 30h7a6 6 0 0 1 6 6v3"
        fill="none"
        stroke={INK}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M47 39l7-6M47 39l7 6" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
      <Bolt x={20} y={12} s={0.75} />
    </>
  ),

  inspection: () => (
    <>
      <Car x={-4} y={4} s={0.72} />
      <g transform="translate(28 2)">
        <rect x="0" y="4" width="28" height="36" rx="5" fill={WHITE} />
        <rect x="0" y="4" width="28" height="36" rx="5" fill="none" stroke={INK} strokeWidth="2.4" />
        <rect x="8" y="0" width="12" height="8" rx="3" fill={INK} />
        <g stroke={BODY} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M6 16l2.6 2.6L14 13" />
          <path d="M6 27l2.6 2.6L14 24" />
        </g>
        <g fill={INK} opacity="0.3">
          <rect x="17" y="16" width="6" height="2.6" rx="1.3" />
          <rect x="17" y="27" width="6" height="2.6" rx="1.3" />
        </g>
      </g>
    </>
  ),

  fleet: () => (
    <>
      <Ground />
      <path d="M4 40V20a3 3 0 0 1 3-3h24v23Z" fill={BODY} />
      <path d="M31 40V24h11l9 10v6Z" fill={INK} />
      <rect x="36" y="26" width="9" height="6" rx="2" fill={PALE} />
      <rect x="9" y="23" width="14" height="4" rx="2" fill={WHITE} opacity="0.35" />
      <circle cx="17" cy="42" r="6.4" fill={INK} />
      <circle cx="44" cy="42" r="6.4" fill={INK} />
      <circle cx="17" cy="42" r="2.5" fill={PALE} />
      <circle cx="44" cy="42" r="2.5" fill={PALE} />
    </>
  ),

  bike: () => (
    <>
      <Ground />
      <Tyre cx={14} cy={38} r={11} />
      <Tyre cx={50} cy={38} r={11} />
      <path
        d="M14 38 25 22h11l6 8M42 30l8 8"
        fill="none"
        stroke={BODY}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M23 20h16a7 7 0 0 1 6 8H27Z" fill={BODY} />
      <path d="M19 16h9" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </>
  ),

  /* ─────────── Devices ─────────── */

  phone: () => (
    <>
      <rect x="17" y="6" width="26" height="46" rx="6" fill={BODY} />
      <rect x="20" y="12" width="20" height="32" rx="3" fill={PALE} />
      <rect x="26" y="8.5" width="8" height="2" rx="1" fill={PALE} opacity="0.6" />
      <circle cx="30" cy="48" r="2.2" fill={PALE} />
      <Spanner x={45} y={40} rotate={-30} s={0.8} />
    </>
  ),

  'phone-screen': () => (
    <>
      <rect x="17" y="5" width="30" height="50" rx="6" fill={INK} />
      <rect x="20" y="11" width="24" height="36" rx="3" fill={PALE} />
      <path
        d="M22 20l9 7-5 5 9 9"
        fill="none"
        stroke={WARM}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M31 27l11-5M34 37l9 3" fill="none" stroke={WARM} strokeWidth="2" strokeLinecap="round" opacity=".65" />
    </>
  ),

  'phone-camera': () => (
    <>
      <rect x="17" y="6" width="26" height="46" rx="6" fill={BODY} />
      <rect x="20" y="12" width="20" height="32" rx="3" fill={PALE} />
      <circle cx="30" cy="26" r="7.5" fill={WHITE} />
      <circle cx="30" cy="26" r="7.5" fill="none" stroke={INK} strokeWidth="2" />
      <circle cx="30" cy="26" r="3.2" fill={BODY} />
      <circle cx="35.5" cy="20.5" r="1.6" fill={WARM} />
      <circle cx="30" cy="48.5" r="2" fill={PALE} />
    </>
  ),

  'phone-charging': () => (
    <>
      <rect x="17" y="6" width="26" height="46" rx="6" fill={BODY} />
      <rect x="20" y="12" width="20" height="32" rx="3" fill={PALE} />
      <circle cx="30" cy="48.5" r="2" fill={PALE} />
      <Bolt x={30} y={27} s={1.05} />
    </>
  ),

  'phone-audio': () => (
    <>
      <rect x="15" y="6" width="26" height="46" rx="6" fill={BODY} />
      <rect x="18" y="12" width="20" height="32" rx="3" fill={PALE} />
      <circle cx="28" cy="48.5" r="2" fill={PALE} />
      <rect x="24" y="24" width="8" height="8" rx="1.5" fill={INK} />
      <g fill="none" stroke={WARM} strokeWidth="2.6" strokeLinecap="round">
        <path d="M45 22a10 10 0 0 1 0 16" />
        <path d="M50 16a18 18 0 0 1 0 28" />
      </g>
    </>
  ),

  'phone-water': () => (
    <>
      <rect x="15" y="8" width="26" height="46" rx="6" fill={BODY} />
      <rect x="18" y="14" width="20" height="32" rx="3" fill={PALE} />
      <circle cx="28" cy="50" r="2" fill={PALE} />
      <Drop x={28} y={24} s={1.15} />
      <Drop x={47} y={12} s={0.7} />
      <Drop x={51} y={24} s={0.6} />
    </>
  ),

  'phone-board': () => (
    <>
      <rect x="10" y="12" width="44" height="40" rx="5" fill={BODY} />
      <rect x="21" y="23" width="18" height="18" rx="2.5" fill={INK} />
      <rect x="26" y="28" width="8" height="8" rx="1" fill={PALE} />
      <g stroke={INK} strokeWidth="2" strokeLinecap="round">
        <path d="M21 28h-6M21 34h-6M45 28h-6M45 34h-6M28 23v-6M34 23v-6M28 47v-6M34 47v-6" />
      </g>
      <g fill={WARM}>
        <circle cx="16" cy="19" r="2" />
        <circle cx="48" cy="45" r="2" />
      </g>
    </>
  ),

  'laptop-screen': () => (
    <>
      <rect x="12" y="12" width="40" height="27" rx="3" fill={INK} />
      <rect x="15" y="15" width="34" height="21" rx="2" fill={PALE} />
      <path d="M4 42h56l-4 7H8Z" fill={BODY} />
      <path
        d="M24 18l8 6-5 4 7 7"
        fill="none"
        stroke={WARM}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),

  'laptop-storage': () => (
    <>
      <rect x="12" y="12" width="40" height="27" rx="3" fill={INK} />
      <rect x="15" y="15" width="34" height="21" rx="2" fill={PALE} />
      <path d="M4 42h56l-4 7H8Z" fill={BODY} />
      <rect x="24" y="19" width="16" height="12" rx="2" fill={BODY} />
      <g stroke={PALE} strokeWidth="1.6" strokeLinecap="round">
        <path d="M28 31v3M32 31v3M36 31v3" />
      </g>
      <circle cx="28" cy="25" r="1.4" fill={PALE} />
    </>
  ),

  laptop: () => (
    <>
      <rect x="12" y="12" width="40" height="27" rx="3" fill={INK} />
      <rect x="15" y="15" width="34" height="21" rx="2" fill={PALE} />
      <path d="M4 42h56l-4 7H8Z" fill={BODY} />
      <circle cx="32" cy="25.5" r="7" fill={BODY} />
      <circle cx="32" cy="25.5" r="2.6" fill={PALE} />
      <g fill={BODY}>
        <rect x="30.6" y="15" width="2.8" height="4" rx="1.4" />
        <rect x="30.6" y="32" width="2.8" height="4" rx="1.4" />
      </g>
    </>
  ),

  tv: () => (
    <>
      <rect x="5" y="11" width="54" height="33" rx="4" fill={INK} />
      <rect x="9" y="15" width="46" height="25" rx="2" fill={PALE} />
      <path d="M18 33c4-7 10-11 17-11" fill="none" stroke={BODY} strokeWidth="3" strokeLinecap="round" />
      <circle cx="43" cy="23" r="3.4" fill={BODY} />
      <rect x="29" y="44" width="6" height="7" rx="2" fill={INK} />
      <rect x="19" y="51" width="26" height="4" rx="2" fill={INK} />
    </>
  ),

  router: () => (
    <>
      <Ground y={52} />
      <rect x="8" y="36" width="48" height="15" rx="5" fill={BODY} />
      <g fill={PALE}>
        <circle cx="18" cy="43.5" r="2.4" />
        <circle cx="26" cy="43.5" r="2.4" />
      </g>
      <path d="M43 36V25M50 36l6-9" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <g fill="none" stroke={BODY} strokeWidth="3" strokeLinecap="round">
        <path d="M22 24a15 15 0 0 1 21 0" />
        <path d="M27 30a8 8 0 0 1 11 0" />
      </g>
      <circle cx="32.5" cy="15" r="3" fill={WARM} />
    </>
  ),

  cctv: () => (
    <>
      <path d="M9 19 42 10l4 15-33 9Z" fill={BODY} />
      <path d="M46 16l9-2.4 2.6 9.6L48 26Z" fill={INK} />
      <path d="M22 33v6a6 6 0 0 0 6 6h3" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <circle cx="33" cy="45" r="5" fill={INK} />
      <circle cx="33" cy="45" r="1.8" fill={PALE} />
      <rect x="11" y="8" width="4" height="12" rx="2" fill={INK} />
    </>
  ),

  lock: () => (
    <>
      <rect x="12" y="25" width="40" height="30" rx="6" fill={BODY} />
      <path d="M22 25v-7a10 10 0 0 1 20 0v7" fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
      <g fill={PALE}>
        <circle cx="24" cy="35" r="2.6" />
        <circle cx="32" cy="35" r="2.6" />
        <circle cx="40" cy="35" r="2.6" />
        <circle cx="24" cy="44" r="2.6" />
        <circle cx="32" cy="44" r="2.6" />
        <circle cx="40" cy="44" r="2.6" />
      </g>
    </>
  ),

  'smart-home': () => (
    <>
      <path d="M7 29 32 10l25 19v22a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4Z" fill={BODY} />
      <path d="M32 10 57 29h-7L32 15 14 29H7Z" fill={INK} />
      <g fill="none" stroke={PALE} strokeWidth="3" strokeLinecap="round">
        <path d="M24 41a12 12 0 0 1 16 0" />
        <path d="M28 46a6 6 0 0 1 8 0" />
      </g>
      <circle cx="32" cy="51" r="2.6" fill={PALE} />
    </>
  ),

  appliance: () => (
    <>
      <rect x="13" y="7" width="38" height="48" rx="6" fill={BODY} />
      <rect x="13" y="7" width="38" height="10" rx="6" fill={INK} opacity="0.25" />
      <circle cx="32" cy="35" r="14" fill={PALE} />
      <circle cx="32" cy="35" r="8" fill={BODY} opacity="0.35" />
      <circle cx="32" cy="35" r="8" fill="none" stroke={INK} strokeWidth="2.4" />
      <g fill={WHITE}>
        <circle cx="20" cy="12" r="2.4" />
        <rect x="28" y="10" width="16" height="4" rx="2" />
      </g>
    </>
  ),

  /* ─────────── Home trades ─────────── */

  electrical: () => (
    <>
      <rect x="15" y="7" width="34" height="48" rx="6" fill={BODY} />
      <rect x="21" y="15" width="12" height="17" rx="3" fill={PALE} />
      <rect x="25" y="19" width="4" height="7" rx="2" fill={INK} />
      <Bolt x={41} y={24} s={0.75} />
      <g fill={WHITE} opacity="0.4">
        <rect x="21" y="39" width="22" height="3.4" rx="1.7" />
        <rect x="21" y="46" width="14" height="3.4" rx="1.7" />
      </g>
    </>
  ),

  plumbing: () => (
    <>
      <path
        d="M7 20h14v13h10V20h11a7 7 0 0 1 7 7v13"
        fill="none"
        stroke={BODY}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="16" y="14" width="10" height="10" rx="3" fill={INK} />
      <Drop x={49} y={42} s={1.1} />
      <Spanner x={16} y={44} rotate={40} s={0.8} />
    </>
  ),

  carpentry: () => (
    <>
      <rect x="6" y="30" width="34" height="22" rx="3" fill={BODY} />
      <g fill={WHITE} opacity="0.35">
        <rect x="11" y="36" width="9" height="3" rx="1.5" />
        <rect x="11" y="43" width="20" height="3" rx="1.5" />
      </g>
      <path d="M38 32 55 15l7 7-17 17Z" fill={INK} />
      <path d="M52 12l6 6 4-4-6-6Z" fill={WARM} />
      <Ground y={54} w={20} />
    </>
  ),

  cleaning: () => (
    <>
      <path d="M13 24h26l-3 27a5 5 0 0 1-5 4.4H21A5 5 0 0 1 16 51Z" fill={BODY} />
      <rect x="9" y="19" width="34" height="7" rx="3.5" fill={INK} />
      <path d="M30 19c0-7 6-11 13-11" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
      <g fill={TINT}>
        <circle cx="50" cy="14" r="6" />
        <circle cx="57" cy="25" r="4" />
        <circle cx="49" cy="32" r="3" />
      </g>
    </>
  ),

  /* ─────────── People & occasions ─────────── */

  helper: () => (
    <>
      <circle cx="23" cy="18" r="10" fill={BODY} />
      <path d="M5 54v-5a18 18 0 0 1 30-13.4L36 54Z" fill={BODY} />
      <path
        d="M47 55c-6.6-4.8-11-8.2-11-13a5.9 5.9 0 0 1 11-2.9 5.9 5.9 0 0 1 11 2.9c0 4.8-4.4 8.2-11 13Z"
        fill={WARM}
      />
    </>
  ),

  event: () => (
    <>
      <path d="M5 12h54v23a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5Z" fill={BODY} />
      <path d="M5 12l9 9 9-9 9 9 9-9 9 9 9-9Z" fill={INK} />
      <rect x="18" y="40" width="4" height="14" rx="2" fill={INK} />
      <rect x="42" y="40" width="4" height="14" rx="2" fill={INK} />
      <Sparkle x={32} y={29} s={1.2} color={WHITE} />
    </>
  ),

  'event-av': () => (
    <>
      <rect x="10" y="14" width="24" height="38" rx="5" fill={INK} />
      <circle cx="22" cy="26" r="6.5" fill={BODY} />
      <circle cx="22" cy="41" r="4.5" fill={BODY} opacity="0.6" />
      <g fill="none" stroke={WARM} strokeWidth="3" strokeLinecap="round">
        <path d="M41 22a12 12 0 0 1 0 22" />
        <path d="M48 15a20 20 0 0 1 0 36" />
      </g>
      <Ground y={54} w={16} />
    </>
  ),

  pet: () => (
    <>
      <path d="M17 24c-4-6-4-13 .5-14s7.5 4.5 7.5 10" fill={BODY} />
      <path d="M47 24c4-6 4-13-.5-14S39 14.5 39 20.5" fill={BODY} />
      <circle cx="32" cy="36" r="17" fill={BODY} />
      <ellipse cx="32" cy="43" rx="9" ry="7" fill={PALE} />
      <g fill={INK}>
        <circle cx="25.5" cy="32" r="2.6" />
        <circle cx="38.5" cy="32" r="2.6" />
        <ellipse cx="32" cy="39" rx="3.2" ry="2.4" />
      </g>
      <path d="M32 41v3M28.5 46a4.5 4.5 0 0 0 7 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  ),

  /* ─────────── Fallback ─────────── */

  tools: () => (
    <>
      <Spanner x={24} y={32} rotate={-38} s={1.35} color={BODY} />
      <g transform="rotate(38 38 32)">
        <path d="M32 12h12v30a6 6 0 0 1-12 0Z" fill={INK} />
        <path d="M32 12h12V6a6 6 0 0 0-12 0Z" fill={WARM} />
      </g>
      <Ground y={54} w={18} />
    </>
  ),
};

/**
 * Resolve a service to a drawing using the category's ordered rules, then the
 * shared generic rules, then the category default. Pure lookup — safe to call
 * inside a render loop.
 */
export function illustrationFor(service, category) {
  if (!service) return category?.illustration || 'tools';
  const rules = category?.illustrationRules || GENERIC_ILLUSTRATION_RULES;

  // Identity first (code/name/subcategory), then the full text including
  // descriptions. Without the two passes a service picks up a drawing for
  // something its description merely mentions — "Car Wash" listing "interior
  // vacuuming" would render as an interior-cleaning job.
  for (const scope of ['identity', 'full']) {
    for (const [match, key] of rules) {
      if (match(service, scope) && DRAWINGS[key]) return key;
    }
    for (const [match, key] of GENERIC_ILLUSTRATION_RULES) {
      if (match(service, scope) && DRAWINGS[key]) return key;
    }
  }
  return DRAWINGS[category?.illustration] ? category.illustration : 'tools';
}

export const hasIllustration = (name) => Boolean(DRAWINGS[name]);

/**
 * @param {string}  name       drawing key (see DRAWINGS)
 * @param {number}  size       rendered px size
 * @param {boolean} spotlight  warm cone behind the subject — on for tiles,
 *                             off when the drawing already sits on a coloured
 *                             surface (hero banners), where it would muddy.
 * Decorative by default: the service name beside it carries the meaning, so the
 * SVG is hidden from assistive tech unless a `title` is passed.
 */
function ServiceIllustration({ name, size = 44, className = '', title, spotlight = true }) {
  const Draw = DRAWINGS[name] || DRAWINGS.tools;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {spotlight ? <Spotlight /> : null}
      <Draw />
    </svg>
  );
}

export default memo(ServiceIllustration);
