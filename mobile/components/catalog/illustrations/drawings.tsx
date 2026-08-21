/**
 * The Zappy service drawings — 54 of them.
 * ----------------------------------------------------------------------------
 * MECHANICAL PORT of `client/src/components/catalog/ServiceIllustration.jsx`.
 * The path data, the shapes, the opacities and the composition are byte-for-byte
 * the website's; only the host changed. Converted rather than redrawn so the two
 * platforms cannot drift, and so a fix to a drawing on either side is portable.
 *
 * What the conversion touched, and nothing else:
 *   <g|path|circle|rect|ellipse>  →  <G|Path|Circle|Rect|Ellipse>
 *   INK / BODY / TINT / PALE      →  fields on the `Inks` object (see palette.ts)
 *   aria-hidden                   →  dropped; RN has no such attribute
 *
 * The web reads its four inks from CSS custom properties on an ancestor. React
 * Native has no cascade, so every drawing takes an `Inks` argument and threads
 * it into the helpers. That is the only structural difference.
 *
 * The drawing language, from the original file's own notes: filled, scene-style
 * vector art — a subject built from solid shapes under a warm spotlight, not a
 * line icon. No emoji, no icon fonts, no per-page icon sets.
 * ----------------------------------------------------------------------------
 */

import React from 'react';
import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { Inks } from './palette';

/** The one warm note in the system — never themed. */
const WARM = '#F59E0B';
const WHITE = '#FFFFFF';

interface HelperProps { c: Inks }
interface XYS { x?: number; y?: number; s?: number }
interface Tinted { color?: string }

/** The warm cone behind every subject — the signature of the set. */
function Spotlight() {
  return (
    <G>
      <Path d="M32 2 60 46H4Z" fill={WARM} opacity="0.10" />
      <Path d="M32 6 51 46H13Z" fill={WARM} opacity="0.13" />
    </G>
  );
}

function Ground({ c, y = 50, w = 22, opacity = 0.12 }: HelperProps & { y?: number; w?: number; opacity?: number }) {
  return <Ellipse cx="32" cy={y} rx={w} ry="2.6" fill={c.ink} opacity={opacity} />;
}

/**
 * Side-profile car, filled. Reused across the automotive set so every car-based
 * drawing is unmistakably the same vehicle.
 */
function Car({ c, x = 0, y = 0, s = 1 }: HelperProps & XYS) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path
        d="M4 40v-6.3c0-1.9 1.3-3.5 3.1-4l8.6-2 4.8-6.2A6 6 0 0 1 25.2 19h13.6a6 6 0 0 1 4.7 2.3l4.9 6.4 8.5 2c1.8.5 3.1 2.1 3.1 4V40a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
        fill={c.body}
      />
      <Path d="M21.5 27.5h9v-6.2h-3.4a2 2 0 0 0-1.6.8Z" fill={c.pale} />
      <Path d="M33.5 21.3h4.9a2 2 0 0 1 1.6.8l4.2 5.4h-10.7Z" fill={c.pale} />
      <Rect x="4" y="33" width="10" height="3.4" rx="1.7" fill={WHITE} opacity="0.35" />
      <Circle cx="18" cy="42" r="6.4" fill={c.ink} />
      <Circle cx="46" cy="42" r="6.4" fill={c.ink} />
      <Circle cx="18" cy="42" r="2.5" fill={c.pale} />
      <Circle cx="46" cy="42" r="2.5" fill={c.pale} />
    </G>
  );
}

function Tyre({ c, cx, cy, r = 15 }: HelperProps & { cx: number; cy: number; r?: number }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={c.ink} />
      <Circle cx={cx} cy={cy} r={r * 0.58} fill={c.pale} />
      <Circle cx={cx} cy={cy} r={r * 0.22} fill={c.body} />
      <G fill={WHITE} opacity="0.35">
        <Rect x={cx - 1.4} y={cy - r} width="2.8" height="4" rx="1.4" />
        <Rect x={cx - 1.4} y={cy + r - 4} width="2.8" height="4" rx="1.4" />
        <Rect x={cx - r} y={cy - 1.4} width="4" height="2.8" rx="1.4" />
        <Rect x={cx + r - 4} y={cy - 1.4} width="4" height="2.8" rx="1.4" />
      </G>
    </G>
  );
}

function Snowflake({ x, y, s = 1, color = WHITE }: HelperProps & XYS & Tinted) {
  return (
    <G
      transform={`translate(${x} ${y}) scale(${s})`}
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
    >
      <Path d="M0-7V7M-6-3.5 6 3.5M-6 3.5 6-3.5" />
      <Path d="M-2.2-4.4 0-6.6l2.2 2.2M-2.2 4.4 0 6.6l2.2-2.2" />
    </G>
  );
}

function Sparkle({ x, y, s = 1, color = WARM }: HelperProps & XYS & Tinted) {
  return (
    <Path
      d="M0-5.5C.7-2.3 1.6-1.4 4.8-.7v.2C1.6.2.7 1.1 0 4.3h-.2c-.7-3.2-1.6-4.1-4.8-4.8v-.2c3.2-.7 4.1-1.6 4.8-4.8Z"
      fill={color}
      transform={`translate(${x} ${y}) scale(${s})`}
    />
  );
}

function Drop({ c, x, y, s = 1, color }: HelperProps & XYS & Tinted) {
  return (
    <Path
      d="M0 0c2.7 3 4.2 5 4.2 6.7a4.2 4.2 0 0 1-8.4 0C-4.2 5-2.7 3 0 0Z"
      fill={color ?? c.body}
      transform={`translate(${x} ${y}) scale(${s})`}
    />
  );
}

function Bolt({ x, y, s = 1, color = WARM }: HelperProps & XYS & Tinted) {
  return (
    <Path
      d="M1-9-7 2h5l-2 8L9-1H3l3-8Z"
      fill={color}
      transform={`translate(${x} ${y}) scale(${s})`}
    />
  );
}

function Spanner({ c, x, y, rotate = 0, s = 1, color }: HelperProps & XYS & Tinted & { rotate?: number }) {
  return (
    <Path
      d="M8.6-9.4a6.4 6.4 0 0 0-8.3 8.2l-11 11 2.9 2.9 11-11a6.4 6.4 0 0 0 8.2-8.3L7.6-3.4 4-4.3 3.1-7.9Z"
      fill={color ?? c.ink}
      transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s})`}
    />
  );
}

/* ── The set ──────────────────────────────────────────────────────────────── */

export const DRAWINGS: Record<string, (c: Inks) => React.ReactNode> = {
  /* ─────────── Automotive ─────────── */

  'periodic-service': (c) => (
    <>
      <Ground c={c} />
      <Car c={c} x={-2} y={-4} s={0.92} />
      <G transform="translate(24 6)">
        <Rect x="0" y="2" width="30" height="27" rx="4" fill={WHITE} />
        <Rect x="0" y="2" width="30" height="27" rx="4" fill="none" stroke={c.ink} strokeWidth="2.4" />
        <Rect x="0" y="2" width="30" height="7" rx="4" fill={c.ink} />
        <Rect x="0" y="6" width="30" height="3" fill={c.ink} />
        <Rect x="6" y="0" width="3" height="6" rx="1.5" fill={c.ink} />
        <Rect x="21" y="0" width="3" height="6" rx="1.5" fill={c.ink} />
        <G fill={c.body}>
          <Rect x="5" y="13" width="4" height="4" rx="1" />
          <Rect x="13" y="13" width="4" height="4" rx="1" />
          <Rect x="21" y="13" width="4" height="4" rx="1" />
          <Rect x="5" y="20" width="4" height="4" rx="1" />
          <Rect x="13" y="20" width="4" height="4" rx="1" opacity="0.45" />
          <Rect x="21" y="20" width="4" height="4" rx="1" opacity="0.45" />
        </G>
      </G>
    </>
  ),

  'car-ac': (c) => (
    <>
      <Ground c={c} />
      <Car c={c} y={-2} s={0.94} />
      <G transform="translate(44 4)">
        <Rect x="0" y="0" width="11" height="26" rx="5.5" fill={WHITE} />
        <Rect x="0" y="0" width="11" height="26" rx="5.5" fill="none" stroke={c.ink} strokeWidth="2.2" />
        <Rect x="3.5" y="5" width="4" height="14" rx="2" fill={c.body} />
        <Circle cx="5.5" cy="21" r="4.5" fill={c.body} />
      </G>
      <Circle cx="17" cy="12" r="10" fill={c.body} />
      <Snowflake c={c} x={17} y={12} s={1.05} />
    </>
  ),

  'ac-gas': (c) => (
    <>
      <Ground c={c} y={52} w={14} />
      <Rect x="14" y="16" width="20" height="36" rx="9" fill={c.body} />
      <Rect x="18" y="22" width="5" height="18" rx="2.5" fill={WHITE} opacity="0.35" />
      <Rect x="19" y="8" width="10" height="9" rx="3" fill={c.ink} />
      <Rect x="21.5" y="4" width="5" height="6" rx="2.5" fill={c.ink} />
      <Path
        d="M34 26h8a7 7 0 0 1 7 7v7"
        fill="none"
        stroke={c.ink}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Circle cx="49" cy="46" r="9" fill={c.tint} />
      <Snowflake c={c} x={49} y={46} s={0.9} color={c.ink} />
    </>
  ),

  battery: (c) => (
    <>
      <Ground c={c} />
      <Rect x="8" y="18" width="48" height="28" rx="6" fill={c.body} />
      <Rect x="8" y="18" width="48" height="8" rx="6" fill={c.ink} opacity="0.25" />
      <Rect x="16" y="12" width="9" height="7" rx="2" fill={c.ink} />
      <Rect x="39" y="12" width="9" height="7" rx="2" fill={c.ink} />
      <G fill={WHITE}>
        <Rect x="16" y="31" width="11" height="3" rx="1.5" />
        <Rect x="20" y="27" width="3" height="11" rx="1.5" />
        <Rect x="37" y="31" width="11" height="3" rx="1.5" />
      </G>
      <Bolt c={c} x={32} y={34} s={0.85} />
    </>
  ),

  tyre: (c) => (
    <>
      <Tyre c={c} cx={27} cy={26} r={17} />
      {/* Cradling hand, as in a tyre-care mark. */}
      <Path
        d="M8 46h34a5 5 0 0 0 0-10H23l-9-5-4 4 5 4H8a3 3 0 0 0 0 7Z"
        fill={c.tint}
      />
      <Path d="M8 46h34a5 5 0 0 0 0-10H23" fill="none" stroke={c.ink} strokeWidth="2.2" strokeLinecap="round" />
      <Sparkle c={c} x={49} y={13} s={0.9} />
    </>
  ),

  'wheel-align': (c) => (
    <>
      <Ground c={c} />
      <Tyre c={c} cx={24} cy={28} r={15} />
      <G stroke={c.body} strokeWidth="2.4" strokeLinecap="round" fill="none">
        <Path d="M48 10v36" strokeDasharray="5 5" />
        <Path d="M42 20l7 8-7 8" />
      </G>
      <Rect x="6" y="47" width="52" height="3" rx="1.5" fill={c.ink} opacity="0.5" />
    </>
  ),

  'wheel-balance': (c) => (
    <>
      <Tyre c={c} cx={32} cy={26} r={16} />
      <Rect x="43" y="14" width="8" height="8" rx="2.5" fill={WARM} />
      <Rect x="13" y="30" width="8" height="8" rx="2.5" fill={WARM} />
      <Rect x="29" y="44" width="6" height="8" rx="2" fill={c.ink} />
      <Rect x="18" y="50" width="28" height="4" rx="2" fill={c.ink} />
    </>
  ),

  'car-wash': (c) => (
    <>
      <Ground c={c} />
      <Car c={c} y={-1} s={0.94} />
      <G>
        <Drop c={c} x={12} y={4} s={0.85} />
        <Drop c={c} x={26} y={1} s={1} />
        <Drop c={c} x={41} y={4} s={0.85} />
        <Drop c={c} x={53} y={9} s={0.7} />
      </G>
      <Sparkle c={c} x={50} y={22} s={0.8} color={WHITE} />
    </>
  ),

  'foam-wash': (c) => (
    <>
      <G fill={c.tint}>
        <Circle cx="14" cy="16" r="8" />
        <Circle cx="9" cy="29" r="5.5" />
        <Circle cx="17" cy="38" r="7" />
        <Circle cx="7" cy="42" r="4" />
      </G>
      <G transform="translate(30 18)">
        <Path d="M10 4h14a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5H10Z" fill={c.body} />
        <Path d="M10 8H1L-7 3v18l8-5h9Z" fill={c.ink} />
        <Rect x="12" y="23" width="6" height="10" rx="2" fill={c.ink} />
      </G>
      <Ground c={c} y={52} w={16} />
    </>
  ),

  'interior-clean': (c) => (
    <>
      <Ground c={c} />
      <Path d="M12 48V26a8 8 0 0 1 8-8h3a7 7 0 0 1 7 7v23Z" fill={c.body} />
      <Path d="M30 48h13a5 5 0 0 0 5-5V30" fill="none" stroke={c.ink} strokeWidth="3" strokeLinecap="round" />
      <Path d="M40 22h16l-5 12H45Z" fill={c.ink} />
      <Rect x="46" y="10" width="4" height="13" rx="2" fill={c.ink} />
      <Sparkle c={c} x={21} y={31} s={0.95} color={WHITE} />
    </>
  ),

  ceramic: (c) => (
    <>
      <Ground c={c} />
      <Car c={c} y={-1} s={0.9} />
      <G transform="translate(38 2)">
        <Path d="M11 0l11 4v9c0 6.4-4.6 11-11 12.6C4.6 24 0 19.4 0 13V4Z" fill={WARM} />
        <Path
          d="M5.5 12.6l3.8 3.8L17 8.6"
          fill="none"
          stroke={WHITE}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
    </>
  ),

  detailing: (c) => (
    <>
      <Ground c={c} />
      <Car c={c} y={-1} s={0.94} />
      <Sparkle c={c} x={11} y={11} s={1.15} />
      <Sparkle c={c} x={31} y={5} s={0.85} />
      <Sparkle c={c} x={54} y={15} s={1} />
    </>
  ),

  scratch: (c) => (
    <>
      <Rect x="4" y="14" width="38" height="32" rx="6" fill={c.body} />
      <Rect x="9" y="19" width="12" height="6" rx="3" fill={WHITE} opacity="0.3" />
      <Path
        d="M11 40c6-9 12-14 20-18"
        fill="none"
        stroke={WARM}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Path d="M15 43c5-6 9-10 14-13" fill="none" stroke={WARM} strokeWidth="2" strokeLinecap="round" opacity=".6" />
      <Circle cx="48" cy="38" r="11" fill={c.ink} />
      <Circle cx="48" cy="38" r="5" fill={c.pale} />
      <Rect x="46" y="16" width="4" height="12" rx="2" fill={c.ink} />
      <Ground c={c} y={52} />
    </>
  ),

  dent: (c) => (
    <>
      <Path d="M4 16h42a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H4Z" fill={c.body} />
      <Path d="M16 32c4-6 11-6 15 0s-4 11-9 6.6S20 26 16 32Z" fill={c.pale} />
      <G transform="translate(40 22)">
        <Rect x="0" y="8" width="16" height="4" rx="2" fill={c.ink} />
        <Rect x="6" y="0" width="4" height="20" rx="2" fill={c.ink} />
      </G>
      <Ground c={c} y={52} />
    </>
  ),

  paint: (c) => (
    <>
      {/* Door panel being sprayed — the subject of the job. */}
      <Path d="M38 20h18a4 4 0 0 1 4 4v22H38Z" fill={c.tint} />
      <Rect x="42" y="26" width="12" height="7" rx="3" fill={c.pale} />
      <G transform="translate(6 12)">
        <Path d="M12 10h8V4h7v6h4a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-4v16h-7V24h-8Z" fill={c.ink} />
        <Path d="M12 14H5a4 4 0 0 0-4 4v3" fill="none" stroke={c.ink} strokeWidth="3" strokeLinecap="round" />
        <Rect x="20" y="0" width="7" height="6" rx="1.5" fill={c.body} />
      </G>
      <G fill={c.body} opacity="0.75">
        <Circle cx="38" cy="21" r="2.4" />
        <Circle cx="35" cy="30" r="1.8" />
        <Circle cx="37" cy="38" r="2.1" />
      </G>
      <Ground c={c} y={52} />
    </>
  ),

  windshield: (c) => (
    <>
      <Path d="M11 44 19 17a5 5 0 0 1 4.8-3.6h16.4A5 5 0 0 1 45 17l8 27Z" fill={c.pale} />
      <Path
        d="M11 44 19 17a5 5 0 0 1 4.8-3.6h16.4A5 5 0 0 1 45 17l8 27Z"
        fill="none"
        stroke={c.body}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <Path
        d="M31 19l-3.5 9 6.5 3-4.5 10"
        fill="none"
        stroke={c.ink}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Sparkle c={c} x={44} y={24} s={0.8} />
      <Rect x="6" y="47" width="52" height="4" rx="2" fill={c.ink} opacity="0.5" />
    </>
  ),

  headlight: (c) => (
    <>
      <Path d="M8 20h14c9 0 16 5.4 16 12s-7 12-16 12H8Z" fill={c.body} />
      <Circle cx="21" cy="32" r="7" fill={WARM} />
      <Circle cx="21" cy="32" r="3" fill={WHITE} />
      <G stroke={WARM} strokeWidth="3" strokeLinecap="round">
        <Path d="M44 21l10-4M44 32h13M44 43l10 4" />
      </G>
      <Ground c={c} y={50} />
    </>
  ),

  brake: (c) => (
    <>
      <Circle cx="28" cy="30" r="19" fill={c.ink} />
      <Circle cx="28" cy="30" r="13" fill={c.body} />
      <Circle cx="28" cy="30" r="6" fill={c.pale} />
      <G fill={WHITE} opacity="0.3">
        <Rect x="26.6" y="11" width="2.8" height="5" rx="1.4" />
        <Rect x="26.6" y="44" width="2.8" height="5" rx="1.4" />
        <Rect x="9" y="28.6" width="5" height="2.8" rx="1.4" />
        <Rect x="42" y="28.6" width="5" height="2.8" rx="1.4" />
      </G>
      <Path d="M45 17a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6Z" fill={WARM} />
    </>
  ),

  suspension: (c) => (
    <>
      <Rect x="25" y="4" width="14" height="6" rx="3" fill={c.ink} />
      <Rect x="25" y="52" width="14" height="6" rx="3" fill={c.ink} />
      <Rect x="29.5" y="9" width="5" height="7" rx="2.5" fill={c.ink} />
      <Rect x="29.5" y="47" width="5" height="6" rx="2.5" fill={c.ink} />
      <Path
        d="M20 18h24l-24 6h24l-24 6h24l-24 6h24l-24 6h24"
        fill="none"
        stroke={c.body}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Spanner c={c} x={53} y={44} rotate={-30} s={0.7} />
    </>
  ),

  engine: (c) => (
    <>
      <Ground c={c} />
      <Path d="M12 24h8v-6h13v6h8l6 6h6v14a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4Z" fill={c.body} />
      <Path d="M12 33H5v9h7Z" fill={c.ink} />
      <Circle cx="42" cy="40" r="6" fill={c.ink} />
      <Circle cx="42" cy="40" r="2.4" fill={c.pale} />
      <Rect x="21" y="20" width="10" height="4" rx="2" fill={WHITE} opacity="0.35" />
      <G stroke={WARM} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <Path d="M24 12c0 3-4 3-4 6M33 9c0 3-4 3-4 6" />
      </G>
    </>
  ),

  oil: (c) => (
    <>
      <Ground c={c} />
      <Path d="M8 28h20l9-7v7h6a5 5 0 0 1 5 5v9a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5Z" fill={c.body} />
      <Path d="M47 33h8l-5-13" fill="none" stroke={c.ink} strokeWidth="3" strokeLinecap="round" />
      <Rect x="18" y="20" width="10" height="4" rx="2" fill={c.ink} />
      <Drop c={c} x={53} y={36} s={1.05} color={WARM} />
    </>
  ),

  insurance: (c) => (
    <>
      <Path d="M32 4l22 7.6v17.6C54 43 44.8 51 32 55.2 19.2 51 10 43 10 29.2V11.6Z" fill={c.body} />
      <G transform="translate(6 14)">
        <Car c={c} s={0.78} y={-4} />
      </G>
      <Circle cx="45" cy="43" r="11" fill={WARM} />
      <Path
        d="M40 43l3.6 3.6L51 39"
        fill="none"
        stroke={WHITE}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),

  towing: (c) => (
    <>
      <Ground c={c} />
      <Car c={c} x={-8} y={-1} s={0.8} />
      <G transform="translate(34 8)">
        <Path d="M2 12h6l14-8v6l-14 8Z" fill={c.ink} />
        <Rect x="0" y="10" width="5" height="18" rx="2" fill={c.ink} />
        <Path d="M18 22a5 5 0 1 0 10 0" fill="none" stroke={c.ink} strokeWidth="3" strokeLinecap="round" />
      </G>
    </>
  ),

  fuel: (c) => (
    <>
      <Ground c={c} y={52} w={16} />
      <Path d="M16 14a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v38H16Z" fill={c.body} />
      <Rect x="21" y="15" width="14" height="10" rx="3" fill={c.pale} />
      <Path
        d="M40 20h6a4 4 0 0 1 4 4v14a4 4 0 0 0 4 4"
        fill="none"
        stroke={c.ink}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Drop c={c} x={28} y={32} s={0.9} color={WARM} />
    </>
  ),

  roadside: (c) => (
    <>
      <Ground c={c} />
      <Car c={c} x={-7} y={-1} s={0.82} />
      <G transform="translate(30 6)">
        <Path d="M14 0 28 26H0Z" fill={WARM} />
        <Rect x="12" y="9" width="4" height="9" rx="2" fill={WHITE} />
        <Circle cx="14" cy="21.5" r="2.2" fill={WHITE} />
      </G>
    </>
  ),

  jumpstart: (c) => (
    <>
      <Ground c={c} y={52} />
      <Rect x="4" y="24" width="30" height="24" rx="5" fill={c.body} />
      <Rect x="10" y="18" width="7" height="7" rx="2" fill={c.ink} />
      <Rect x="22" y="18" width="7" height="7" rx="2" fill={c.ink} />
      <G fill={WHITE}>
        <Rect x="9" y="35" width="9" height="3" rx="1.5" />
        <Rect x="12" y="32" width="3" height="9" rx="1.5" />
        <Rect x="22" y="35" width="9" height="3" rx="1.5" />
      </G>
      <Path
        d="M34 30h7a6 6 0 0 1 6 6v3"
        fill="none"
        stroke={c.ink}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <Path d="M47 39l7-6M47 39l7 6" fill="none" stroke={c.ink} strokeWidth="3.2" strokeLinecap="round" />
      <Bolt c={c} x={20} y={12} s={0.75} />
    </>
  ),

  inspection: (c) => (
    <>
      <Car c={c} x={-4} y={4} s={0.72} />
      <G transform="translate(28 2)">
        <Rect x="0" y="4" width="28" height="36" rx="5" fill={WHITE} />
        <Rect x="0" y="4" width="28" height="36" rx="5" fill="none" stroke={c.ink} strokeWidth="2.4" />
        <Rect x="8" y="0" width="12" height="8" rx="3" fill={c.ink} />
        <G stroke={c.body} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M6 16l2.6 2.6L14 13" />
          <Path d="M6 27l2.6 2.6L14 24" />
        </G>
        <G fill={c.ink} opacity="0.3">
          <Rect x="17" y="16" width="6" height="2.6" rx="1.3" />
          <Rect x="17" y="27" width="6" height="2.6" rx="1.3" />
        </G>
      </G>
    </>
  ),

  fleet: (c) => (
    <>
      <Ground c={c} />
      <Path d="M4 40V20a3 3 0 0 1 3-3h24v23Z" fill={c.body} />
      <Path d="M31 40V24h11l9 10v6Z" fill={c.ink} />
      <Rect x="36" y="26" width="9" height="6" rx="2" fill={c.pale} />
      <Rect x="9" y="23" width="14" height="4" rx="2" fill={WHITE} opacity="0.35" />
      <Circle cx="17" cy="42" r="6.4" fill={c.ink} />
      <Circle cx="44" cy="42" r="6.4" fill={c.ink} />
      <Circle cx="17" cy="42" r="2.5" fill={c.pale} />
      <Circle cx="44" cy="42" r="2.5" fill={c.pale} />
    </>
  ),

  bike: (c) => (
    <>
      <Ground c={c} />
      <Tyre c={c} cx={14} cy={38} r={11} />
      <Tyre c={c} cx={50} cy={38} r={11} />
      <Path
        d="M14 38 25 22h11l6 8M42 30l8 8"
        fill="none"
        stroke={c.body}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M23 20h16a7 7 0 0 1 6 8H27Z" fill={c.body} />
      <Path d="M19 16h9" fill="none" stroke={c.ink} strokeWidth="3" strokeLinecap="round" />
    </>
  ),

  /* ─────────── Devices ─────────── */

  phone: (c) => (
    <>
      <Rect x="17" y="6" width="26" height="46" rx="6" fill={c.body} />
      <Rect x="20" y="12" width="20" height="32" rx="3" fill={c.pale} />
      <Rect x="26" y="8.5" width="8" height="2" rx="1" fill={c.pale} opacity="0.6" />
      <Circle cx="30" cy="48" r="2.2" fill={c.pale} />
      <Spanner c={c} x={45} y={40} rotate={-30} s={0.8} />
    </>
  ),

  'phone-screen': (c) => (
    <>
      <Rect x="17" y="5" width="30" height="50" rx="6" fill={c.ink} />
      <Rect x="20" y="11" width="24" height="36" rx="3" fill={c.pale} />
      <Path
        d="M22 20l9 7-5 5 9 9"
        fill="none"
        stroke={WARM}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M31 27l11-5M34 37l9 3" fill="none" stroke={WARM} strokeWidth="2" strokeLinecap="round" opacity=".65" />
    </>
  ),

  'phone-camera': (c) => (
    <>
      <Rect x="17" y="6" width="26" height="46" rx="6" fill={c.body} />
      <Rect x="20" y="12" width="20" height="32" rx="3" fill={c.pale} />
      <Circle cx="30" cy="26" r="7.5" fill={WHITE} />
      <Circle cx="30" cy="26" r="7.5" fill="none" stroke={c.ink} strokeWidth="2" />
      <Circle cx="30" cy="26" r="3.2" fill={c.body} />
      <Circle cx="35.5" cy="20.5" r="1.6" fill={WARM} />
      <Circle cx="30" cy="48.5" r="2" fill={c.pale} />
    </>
  ),

  'phone-charging': (c) => (
    <>
      <Rect x="17" y="6" width="26" height="46" rx="6" fill={c.body} />
      <Rect x="20" y="12" width="20" height="32" rx="3" fill={c.pale} />
      <Circle cx="30" cy="48.5" r="2" fill={c.pale} />
      <Bolt c={c} x={30} y={27} s={1.05} />
    </>
  ),

  'phone-audio': (c) => (
    <>
      <Rect x="15" y="6" width="26" height="46" rx="6" fill={c.body} />
      <Rect x="18" y="12" width="20" height="32" rx="3" fill={c.pale} />
      <Circle cx="28" cy="48.5" r="2" fill={c.pale} />
      <Rect x="24" y="24" width="8" height="8" rx="1.5" fill={c.ink} />
      <G fill="none" stroke={WARM} strokeWidth="2.6" strokeLinecap="round">
        <Path d="M45 22a10 10 0 0 1 0 16" />
        <Path d="M50 16a18 18 0 0 1 0 28" />
      </G>
    </>
  ),

  'phone-water': (c) => (
    <>
      <Rect x="15" y="8" width="26" height="46" rx="6" fill={c.body} />
      <Rect x="18" y="14" width="20" height="32" rx="3" fill={c.pale} />
      <Circle cx="28" cy="50" r="2" fill={c.pale} />
      <Drop c={c} x={28} y={24} s={1.15} />
      <Drop c={c} x={47} y={12} s={0.7} />
      <Drop c={c} x={51} y={24} s={0.6} />
    </>
  ),

  'phone-board': (c) => (
    <>
      <Rect x="10" y="12" width="44" height="40" rx="5" fill={c.body} />
      <Rect x="21" y="23" width="18" height="18" rx="2.5" fill={c.ink} />
      <Rect x="26" y="28" width="8" height="8" rx="1" fill={c.pale} />
      <G stroke={c.ink} strokeWidth="2" strokeLinecap="round">
        <Path d="M21 28h-6M21 34h-6M45 28h-6M45 34h-6M28 23v-6M34 23v-6M28 47v-6M34 47v-6" />
      </G>
      <G fill={WARM}>
        <Circle cx="16" cy="19" r="2" />
        <Circle cx="48" cy="45" r="2" />
      </G>
    </>
  ),

  'laptop-screen': (c) => (
    <>
      <Rect x="12" y="12" width="40" height="27" rx="3" fill={c.ink} />
      <Rect x="15" y="15" width="34" height="21" rx="2" fill={c.pale} />
      <Path d="M4 42h56l-4 7H8Z" fill={c.body} />
      <Path
        d="M24 18l8 6-5 4 7 7"
        fill="none"
        stroke={WARM}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),

  'laptop-storage': (c) => (
    <>
      <Rect x="12" y="12" width="40" height="27" rx="3" fill={c.ink} />
      <Rect x="15" y="15" width="34" height="21" rx="2" fill={c.pale} />
      <Path d="M4 42h56l-4 7H8Z" fill={c.body} />
      <Rect x="24" y="19" width="16" height="12" rx="2" fill={c.body} />
      <G stroke={c.pale} strokeWidth="1.6" strokeLinecap="round">
        <Path d="M28 31v3M32 31v3M36 31v3" />
      </G>
      <Circle cx="28" cy="25" r="1.4" fill={c.pale} />
    </>
  ),

  laptop: (c) => (
    <>
      <Rect x="12" y="12" width="40" height="27" rx="3" fill={c.ink} />
      <Rect x="15" y="15" width="34" height="21" rx="2" fill={c.pale} />
      <Path d="M4 42h56l-4 7H8Z" fill={c.body} />
      <Circle cx="32" cy="25.5" r="7" fill={c.body} />
      <Circle cx="32" cy="25.5" r="2.6" fill={c.pale} />
      <G fill={c.body}>
        <Rect x="30.6" y="15" width="2.8" height="4" rx="1.4" />
        <Rect x="30.6" y="32" width="2.8" height="4" rx="1.4" />
      </G>
    </>
  ),

  tv: (c) => (
    <>
      <Rect x="5" y="11" width="54" height="33" rx="4" fill={c.ink} />
      <Rect x="9" y="15" width="46" height="25" rx="2" fill={c.pale} />
      <Path d="M18 33c4-7 10-11 17-11" fill="none" stroke={c.body} strokeWidth="3" strokeLinecap="round" />
      <Circle cx="43" cy="23" r="3.4" fill={c.body} />
      <Rect x="29" y="44" width="6" height="7" rx="2" fill={c.ink} />
      <Rect x="19" y="51" width="26" height="4" rx="2" fill={c.ink} />
    </>
  ),

  router: (c) => (
    <>
      <Ground c={c} y={52} />
      <Rect x="8" y="36" width="48" height="15" rx="5" fill={c.body} />
      <G fill={c.pale}>
        <Circle cx="18" cy="43.5" r="2.4" />
        <Circle cx="26" cy="43.5" r="2.4" />
      </G>
      <Path d="M43 36V25M50 36l6-9" fill="none" stroke={c.ink} strokeWidth="3" strokeLinecap="round" />
      <G fill="none" stroke={c.body} strokeWidth="3" strokeLinecap="round">
        <Path d="M22 24a15 15 0 0 1 21 0" />
        <Path d="M27 30a8 8 0 0 1 11 0" />
      </G>
      <Circle cx="32.5" cy="15" r="3" fill={WARM} />
    </>
  ),

  cctv: (c) => (
    <>
      <Path d="M9 19 42 10l4 15-33 9Z" fill={c.body} />
      <Path d="M46 16l9-2.4 2.6 9.6L48 26Z" fill={c.ink} />
      <Path d="M22 33v6a6 6 0 0 0 6 6h3" fill="none" stroke={c.ink} strokeWidth="3" strokeLinecap="round" />
      <Circle cx="33" cy="45" r="5" fill={c.ink} />
      <Circle cx="33" cy="45" r="1.8" fill={c.pale} />
      <Rect x="11" y="8" width="4" height="12" rx="2" fill={c.ink} />
    </>
  ),

  lock: (c) => (
    <>
      <Rect x="12" y="25" width="40" height="30" rx="6" fill={c.body} />
      <Path d="M22 25v-7a10 10 0 0 1 20 0v7" fill="none" stroke={c.ink} strokeWidth="4.5" strokeLinecap="round" />
      <G fill={c.pale}>
        <Circle cx="24" cy="35" r="2.6" />
        <Circle cx="32" cy="35" r="2.6" />
        <Circle cx="40" cy="35" r="2.6" />
        <Circle cx="24" cy="44" r="2.6" />
        <Circle cx="32" cy="44" r="2.6" />
        <Circle cx="40" cy="44" r="2.6" />
      </G>
    </>
  ),

  'smart-home': (c) => (
    <>
      <Path d="M7 29 32 10l25 19v22a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4Z" fill={c.body} />
      <Path d="M32 10 57 29h-7L32 15 14 29H7Z" fill={c.ink} />
      <G fill="none" stroke={c.pale} strokeWidth="3" strokeLinecap="round">
        <Path d="M24 41a12 12 0 0 1 16 0" />
        <Path d="M28 46a6 6 0 0 1 8 0" />
      </G>
      <Circle cx="32" cy="51" r="2.6" fill={c.pale} />
    </>
  ),

  appliance: (c) => (
    <>
      <Rect x="13" y="7" width="38" height="48" rx="6" fill={c.body} />
      <Rect x="13" y="7" width="38" height="10" rx="6" fill={c.ink} opacity="0.25" />
      <Circle cx="32" cy="35" r="14" fill={c.pale} />
      <Circle cx="32" cy="35" r="8" fill={c.body} opacity="0.35" />
      <Circle cx="32" cy="35" r="8" fill="none" stroke={c.ink} strokeWidth="2.4" />
      <G fill={WHITE}>
        <Circle cx="20" cy="12" r="2.4" />
        <Rect x="28" y="10" width="16" height="4" rx="2" />
      </G>
    </>
  ),

  /* ─────────── Home trades ─────────── */

  electrical: (c) => (
    <>
      <Rect x="15" y="7" width="34" height="48" rx="6" fill={c.body} />
      <Rect x="21" y="15" width="12" height="17" rx="3" fill={c.pale} />
      <Rect x="25" y="19" width="4" height="7" rx="2" fill={c.ink} />
      <Bolt c={c} x={41} y={24} s={0.75} />
      <G fill={WHITE} opacity="0.4">
        <Rect x="21" y="39" width="22" height="3.4" rx="1.7" />
        <Rect x="21" y="46" width="14" height="3.4" rx="1.7" />
      </G>
    </>
  ),

  plumbing: (c) => (
    <>
      <Path
        d="M7 20h14v13h10V20h11a7 7 0 0 1 7 7v13"
        fill="none"
        stroke={c.body}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x="16" y="14" width="10" height="10" rx="3" fill={c.ink} />
      <Drop c={c} x={49} y={42} s={1.1} />
      <Spanner c={c} x={16} y={44} rotate={40} s={0.8} />
    </>
  ),

  carpentry: (c) => (
    <>
      <Rect x="6" y="30" width="34" height="22" rx="3" fill={c.body} />
      <G fill={WHITE} opacity="0.35">
        <Rect x="11" y="36" width="9" height="3" rx="1.5" />
        <Rect x="11" y="43" width="20" height="3" rx="1.5" />
      </G>
      <Path d="M38 32 55 15l7 7-17 17Z" fill={c.ink} />
      <Path d="M52 12l6 6 4-4-6-6Z" fill={WARM} />
      <Ground c={c} y={54} w={20} />
    </>
  ),

  cleaning: (c) => (
    <>
      <Path d="M13 24h26l-3 27a5 5 0 0 1-5 4.4H21A5 5 0 0 1 16 51Z" fill={c.body} />
      <Rect x="9" y="19" width="34" height="7" rx="3.5" fill={c.ink} />
      <Path d="M30 19c0-7 6-11 13-11" fill="none" stroke={c.ink} strokeWidth="3.4" strokeLinecap="round" />
      <G fill={c.tint}>
        <Circle cx="50" cy="14" r="6" />
        <Circle cx="57" cy="25" r="4" />
        <Circle cx="49" cy="32" r="3" />
      </G>
    </>
  ),

  /* ─────────── People & occasions ─────────── */

  helper: (c) => (
    <>
      <Circle cx="23" cy="18" r="10" fill={c.body} />
      <Path d="M5 54v-5a18 18 0 0 1 30-13.4L36 54Z" fill={c.body} />
      <Path
        d="M47 55c-6.6-4.8-11-8.2-11-13a5.9 5.9 0 0 1 11-2.9 5.9 5.9 0 0 1 11 2.9c0 4.8-4.4 8.2-11 13Z"
        fill={WARM}
      />
    </>
  ),

  event: (c) => (
    <>
      <Path d="M5 12h54v23a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5Z" fill={c.body} />
      <Path d="M5 12l9 9 9-9 9 9 9-9 9 9 9-9Z" fill={c.ink} />
      <Rect x="18" y="40" width="4" height="14" rx="2" fill={c.ink} />
      <Rect x="42" y="40" width="4" height="14" rx="2" fill={c.ink} />
      <Sparkle c={c} x={32} y={29} s={1.2} color={WHITE} />
    </>
  ),

  'event-av': (c) => (
    <>
      <Rect x="10" y="14" width="24" height="38" rx="5" fill={c.ink} />
      <Circle cx="22" cy="26" r="6.5" fill={c.body} />
      <Circle cx="22" cy="41" r="4.5" fill={c.body} opacity="0.6" />
      <G fill="none" stroke={WARM} strokeWidth="3" strokeLinecap="round">
        <Path d="M41 22a12 12 0 0 1 0 22" />
        <Path d="M48 15a20 20 0 0 1 0 36" />
      </G>
      <Ground c={c} y={54} w={16} />
    </>
  ),

  pet: (c) => (
    <>
      <Path d="M17 24c-4-6-4-13 .5-14s7.5 4.5 7.5 10" fill={c.body} />
      <Path d="M47 24c4-6 4-13-.5-14S39 14.5 39 20.5" fill={c.body} />
      <Circle cx="32" cy="36" r="17" fill={c.body} />
      <Ellipse cx="32" cy="43" rx="9" ry="7" fill={c.pale} />
      <G fill={c.ink}>
        <Circle cx="25.5" cy="32" r="2.6" />
        <Circle cx="38.5" cy="32" r="2.6" />
        <Ellipse cx="32" cy="39" rx="3.2" ry="2.4" />
      </G>
      <Path d="M32 41v3M28.5 46a4.5 4.5 0 0 0 7 0" fill="none" stroke={c.ink} strokeWidth="2" strokeLinecap="round" />
    </>
  ),

  /* ─────────── Fallback ─────────── */

  tools: (c) => (
    <>
      <Spanner c={c} x={24} y={32} rotate={-38} s={1.35} color={c.body} />
      <G transform="rotate(38 38 32)">
        <Path d="M32 12h12v30a6 6 0 0 1-12 0Z" fill={c.ink} />
        <Path d="M32 12h12V6a6 6 0 0 0-12 0Z" fill={WARM} />
      </G>
      <Ground c={c} y={54} w={18} />
    </>
  ),
};
