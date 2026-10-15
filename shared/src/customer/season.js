/**
 * The festive top of the customer home (server content/season): the look of
 * each festival, the decoration drawn across it, which tiles to show and what
 * the offer strip says. Platform-free: the website draws the shapes as SVG,
 * the app with react-native-svg, from the same numbers, so both look alike.
 */
import { formatPaise } from '../utils/money';

/**
 * Each festival's look. `dark` themes put light text on a deep ground.
 *   top/bottom  the band's gradient      ink/sub   headline and lines
 *   tile/line   tile ground and border   accent    offer strip and badges
 *   motif       the decoration across the top, in `paint` colours
 */
export const THEMES = {
  navratri: {
    label: 'Navratri · Dussehra · Bathukamma', dark: false,
    top: '#FFCF5A', bottom: '#FFF5DA', ink: '#4A2300', sub: '#7A4210', accent: '#C2410C',
    tile: '#FFF6DF', tileInk: '#4A2300', line: '#F1D08A', rays: true,
    motif: 'toran', paint: ['#F59E0B', '#FBBF24', '#EA580C', '#2F7D4A', '#B7791F'],
  },
  diwali: {
    label: 'Diwali', dark: true,
    top: '#1B1037', bottom: '#3A1C5C', ink: '#FFF4D6', sub: '#E5D4FF', accent: '#FBBF24',
    tile: '#2A1850', tileInk: '#FFF4D6', line: '#4C2D7A',
    motif: 'lights', paint: ['#FCD34D', '#FB923C', '#FDE68A', '#5B3A1A'],
  },
  holi: {
    label: 'Holi', dark: false,
    top: '#FBCFE8', bottom: '#E0F2FE', ink: '#4A044E', sub: '#6B2160', accent: '#DB2777',
    tile: '#FFFFFF', tileInk: '#4A044E', line: '#F5C2E0', rays: true,
    motif: 'splash', paint: ['#EC4899', '#22C55E', '#F59E0B', '#3B82F6', '#A855F7'],
  },
  sankranti: {
    label: 'Sankranti · Pongal', dark: false,
    top: '#8ED8FA', bottom: '#E6F6FE', ink: '#0B3B5A', sub: '#1F5878', accent: '#EA580C',
    tile: '#FFFFFF', tileInk: '#0B3B5A', line: '#BCE6FA', rays: true,
    motif: 'kites', paint: ['#EF4444', '#F59E0B', '#8B5CF6', '#10B981', '#0B3B5A'],
  },
  eid: {
    label: 'Eid', dark: true,
    top: '#053D30', bottom: '#0B5D47', ink: '#ECFDF5', sub: '#B5F0D6', accent: '#FCD34D',
    tile: '#0A4A3A', tileInk: '#ECFDF5', line: '#17705A',
    motif: 'crescent', paint: ['#FCD34D', '#FEF3C7', '#053D30'],
  },
  christmas: {
    label: 'Christmas · New Year', dark: true,
    top: '#6E1418', bottom: '#9B1C22', ink: '#FFF1F1', sub: '#FFD0D0', accent: '#FDE68A',
    tile: '#7E1A1F', tileInk: '#FFF1F1', line: '#A8343A',
    motif: 'stars', paint: ['#FDE68A', '#FFFFFF', '#86EFAC'],
  },
};

export const themeOf = (key) => THEMES[key] || THEMES.navratri;

/** The drawing area every motif is laid out in, drawn at about phone width. */
export const MOTIF_BOX = { w: 360, h: 96 };

/** Decorations that are a pattern repeat across a wide screen; the rest are one centred piece. */
export const motifRepeats = (themeKey) => ['toran', 'lights', 'splash', 'stars'].includes(themeOf(themeKey).motif);

/** Same numbers every render (no flicker, web and app alike). */
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

const quad = (p0, p1, p2, t) => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
});

const star = (cx, cy, r) => {
  const i = r * 0.38;
  return `M${cx},${cy - r} L${cx + i},${cy - i} L${cx + r},${cy} L${cx + i},${cy + i} L${cx},${cy + r} L${cx - i},${cy + i} L${cx - r},${cy} L${cx - i},${cy - i} Z`;
};

/**
 * The decoration as plain shapes in MOTIF_BOX:
 *   { t: 'circle', cx, cy, r, fill, o? }   { t: 'path', d, fill?, stroke?, sw?, o? }
 * and how each moves, so the website and the app animate the same parts:
 *   anim   'sway' (swings from px,py) · 'twinkle' · 'flicker' · 'float' · 'breathe' · 'fall'
 *   g      shapes with the same g move together (a strand, a kite, the lantern)
 *   delay  seconds, so they do not all move in step
 */
export function motifShapes(themeKey) {
  const th = themeOf(themeKey);
  const [a, b, c, d, e] = th.paint;
  const { w } = MOTIF_BOX;
  const out = [];
  const rnd = seeded(7);

  if (th.motif === 'toran') {
    // A jhalar: a fine gold border, scallops hanging from it, and at each join a
    // small marigold bell on a thread that sways. Line art, not cartoon.
    out.push({ t: 'path', d: `M0,3.5 L${w},3.5`, stroke: e, sw: 1.1 });
    out.push({ t: 'path', d: `M0,7 L${w},7`, stroke: e, sw: 0.6, o: 0.7 });
    for (let x = 0; x < w; x += 24) {
      out.push({ t: 'path', d: `M${x},7 Q${x + 12},21 ${x + 24},7`, stroke: e, sw: 0.9 });
      out.push({ t: 'circle', cx: x + 12, cy: 14.2, r: 1.1, fill: e });
    }
    for (let i = 0, x = 24; x < w; i += 1, x += 24) {
      const long = i % 2 === 0;
      const y = long ? 34 : 26;
      const sway = { g: `b${i}`, anim: 'sway', px: x, py: 7, delay: (i % 5) * 0.4 };
      out.push({ t: 'path', d: `M${x},7 L${x},${y - 4}`, stroke: e, sw: 0.6, ...sway });
      out.push({ t: 'path', d: `M${x - 2.6},${y - 4.5} Q${x},${y - 7.5} ${x + 2.6},${y - 4.5}`, fill: d, ...sway });
      out.push({ t: 'circle', cx: x, cy: y, r: long ? 3.6 : 3, fill: long ? a : c, ...sway });
      out.push({ t: 'circle', cx: x - 0.9, cy: y - 0.9, r: long ? 1.1 : 0.9, fill: '#FFFFFF', o: 0.55, ...sway });
    }
  } else if (th.motif === 'lights') {
    // Two strings of lights, each bulb with a soft glow, and diyas along the bottom edge.
    [[0, 8, 34], [0, 30, 58]].forEach(([, y0, sag], row) => {
      const p0 = { x: -10, y: y0 }; const p1 = { x: w / 2, y: y0 + sag }; const p2 = { x: w + 10, y: y0 };
      out.push({ t: 'path', d: `M${p0.x},${p0.y} Q${p1.x},${p1.y} ${p2.x},${p2.y}`, stroke: d, sw: 1.2, o: 0.8 });
      for (let k = 1; k < 15; k += 1) {
        const p = quad(p0, p1, p2, k / 15);
        const tw = { anim: 'twinkle', delay: ((k * 7 + row * 3) % 10) * 0.18 };
        out.push({ t: 'circle', cx: p.x, cy: p.y + 4, r: 8, fill: k % 2 ? a : b, o: 0.22, ...tw });
        out.push({ t: 'circle', cx: p.x, cy: p.y + 4, r: 3.4, fill: (k + row) % 3 ? a : c, ...tw });
      }
    });
    for (let k = 0; k < 6; k += 1) {
      const x = 30 + k * 60;
      out.push({ t: 'path', d: `M${x - 9},88 Q${x},96 ${x + 9},88 Z`, fill: b });
      const fl = { anim: 'flicker', g: `d${k}`, px: x, py: 87, delay: k * 0.23 };
      out.push({ t: 'path', d: `M${x},76 Q${x + 4},83 ${x},87 Q${x - 4},83 ${x},76 Z`, fill: a, ...fl });
      out.push({ t: 'circle', cx: x, cy: 83, r: 9, fill: a, o: 0.18, ...fl });
    }
  } else if (th.motif === 'splash') {
    // Holi colour: soft clouds of gulal.
    for (let k = 0; k < 26; k += 1) {
      out.push({ t: 'circle', cx: rnd() * w, cy: rnd() * 90, r: 3 + rnd() * 13, fill: th.paint[k % th.paint.length], o: 0.35 + rnd() * 0.35, anim: 'breathe', delay: (k % 6) * 0.4 });
    }
  } else if (th.motif === 'kites') {
    // Kites in the sky, each on its own string.
    [[40, 30, a], [120, 18, b], [210, 40, c], [300, 22, d], [255, 70, a]].forEach(([x, y, fill], k) => {
      const s = k === 4 ? 9 : 13;
      const fly = { g: `k${k}`, anim: 'float', px: x, py: y, delay: k * 0.6 };
      out.push({ t: 'path', d: `M${x},${y - s} L${x + s},${y} L${x},${y + s * 1.3} L${x - s},${y} Z`, fill, ...fly });
      out.push({ t: 'path', d: `M${x},${y - s} L${x},${y + s * 1.3} M${x - s},${y} L${x + s},${y}`, stroke: '#FFFFFF', sw: 0.8, o: 0.7, ...fly });
      out.push({ t: 'path', d: `M${x},${y + s * 1.3} Q${x + 18},${y + 40} ${x - 6},${y + 70}`, stroke: e, sw: 0.7, o: 0.45, ...fly });
    });
  } else if (th.motif === 'crescent') {
    // A crescent moon, stars and a hanging lantern.
    out.push({ t: 'circle', cx: 300, cy: 36, r: 22, fill: a });
    out.push({ t: 'circle', cx: 310, cy: 30, r: 20, fill: c });
    for (let k = 0; k < 14; k += 1) out.push({ t: 'path', d: star(rnd() * 260, 8 + rnd() * 70, 2 + rnd() * 3.5), fill: k % 3 ? b : a, o: 0.9, anim: 'twinkle', delay: (k % 7) * 0.3 });
    const lantern = { g: 'lantern', anim: 'sway', px: 60, py: 0, delay: 0 };
    out.push({ t: 'path', d: 'M60,0 L60,22', stroke: a, sw: 1, ...lantern });
    out.push({ t: 'path', d: 'M52,22 L68,22 L72,40 L60,50 L48,40 Z', fill: a, o: 0.95, ...lantern });
    out.push({ t: 'circle', cx: 60, cy: 36, r: 12, fill: a, o: 0.25, ...lantern });
  } else {
    // Stars and falling snow.
    for (let k = 0; k < 10; k += 1) out.push({ t: 'path', d: star(rnd() * w, 8 + rnd() * 70, 3 + rnd() * 4), fill: a, anim: 'twinkle', delay: k * 0.37 });
    for (let k = 0; k < 30; k += 1) out.push({ t: 'circle', cx: rnd() * w, cy: rnd() * 92, r: 0.8 + rnd() * 1.8, fill: b, o: 0.4 + rnd() * 0.5, anim: 'fall', delay: (k % 10) * 0.6 });
  }
  return out;
}

/**
 * Soft sunburst rays for the light themes, behind everything, in a box `w`×`h`
 * (the whole band): wedges from a point above the middle, white and faint.
 */
export function rayShapes(w = 360, h = 420) {
  const cx = w / 2; const cy = -h * 0.12; const R = h * 1.6;
  const out = [];
  for (let deg = 12; deg < 168; deg += 12) {
    const a1 = (deg * Math.PI) / 180; const a2 = ((deg + 5) * Math.PI) / 180;
    out.push({ t: 'path', d: `M${cx},${cy} L${cx + R * Math.cos(a1)},${cy + R * Math.sin(a1)} L${cx + R * Math.cos(a2)},${cy + R * Math.sin(a2)} Z`, fill: '#FFFFFF', o: 0.16 });
  }
  return out;
}

/**
 * A real photo for a festive tile, by service (website paths, assets/web);
 * services not here use their own picture or art.
 */
export const FESTIVE_PHOTOS = {
  two_wheeler: '/problems/two_wheeler/headings/tw_maintenance.webp',
  four_wheeler: '/problems/four_wheeler/headings/fw_body.webp',
  water_tank_care: '/problems/water_tank_care/headings/wt_cleaning.webp',
  mobile_repair: '/hero/phone-repair.webp',
  laptop_repair: '/hero/phone-bench.webp',
  events: '/hero/events.webp',
  shopping_pickup: '/hero/helping.webp',
};

/**
 * How the tiles sit, so the grid is always full (Blinkit's festive grid):
 * 5 → a tall feature tile and four beside it; 4 → two by two; else rows of 3
 * (or 2, or 1 wide). `feature`: the first tile spans two rows.
 */
export function tileLayout(n) {
  if (n === 5) return { cols: 3, feature: true };
  if (n === 4 || n === 2) return { cols: 2, feature: false };
  if (n === 1) return { cols: 1, feature: false };
  return { cols: 3, feature: false };
}

/**
 * The shapes in drawing order, those sharing a `g` gathered into one group
 * (moved as one): [{ key, anim, px, py, delay, shapes }].
 */
export function motifGroups(shapes) {
  const out = [];
  for (const [i, sh] of shapes.entries()) {
    const last = out[out.length - 1];
    if (sh.g && last?.key === sh.g) { last.shapes.push(sh); continue; }
    out.push({ key: sh.g || `x${i}`, anim: sh.anim || null, px: sh.px ?? sh.cx ?? 0, py: sh.py ?? sh.cy ?? 0, delay: sh.delay || 0, shapes: [sh] });
  }
  return out;
}

/**
 * The season's tiles that can be shown: each tied to a live service (a tile for
 * a service not offered is dropped, never shown broken). Without its own photo,
 * a tile uses the service's art (`artOf(service)`).
 * @param {any} season
 * @param {any[]} services
 * @param {(service: any) => (string | null)} [artOf]
 */
export function seasonTiles(season, services, artOf = () => null) {
  const byCode = new Map((services || []).map((s) => [s.code, s]));
  return (season?.tiles || [])
    .map((t) => {
      const s = byCode.get(t.serviceCode);
      if (!s) return null;
      return { ...t, service: s, image: t.imageUrl || artOf(s) || null };
    })
    .filter(Boolean)
    .slice(0, 6);
}

/** "20% off" or "₹100 off", from a live promo. */
export const offerHeadline = (p) => (p.type === 'percent' ? `${p.discountValue}% off` : `${formatPaise(p.discountValue)} off`);

/** "up to ₹150, on ₹499+", or ''. */
export function offerTerms(p) {
  const parts = [];
  if (p.type === 'percent' && p.maxDiscountPaise) parts.push(`up to ${formatPaise(p.maxDiscountPaise)}`);
  if (p.minOrderPaise) parts.push(`on ${formatPaise(p.minOrderPaise)}+`);
  return parts.join(', ');
}
