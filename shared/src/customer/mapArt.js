// A pro on the customer's map, drawn top-down like Uber's cars, and which way they are heading; websites and apps draw the same.
export const SCOOTER_BOX = 40;
// The ZappyOne rider on a motorbike seen from above, front up, drawn back to front: shadow, tyres, headlight, mirrors,
// handlebar, the blue tank, seat and tail, exhaust, then the rider (blue jacket, arms to the grips, white helmet with an
// amber stripe and a blue visor).
export const SCOOTER = [
  { t: 'ellipse', cx: 20, cy: 21, rx: 7.5, ry: 18.5, fill: 'rgba(16,24,40,0.16)' },
  { t: 'rect', x: 18.4, y: 0.8, w: 3.2, h: 8.6, r: 1.6, fill: '#111827' },
  { t: 'rect', x: 18.4, y: 30.8, w: 3.2, h: 8.6, r: 1.6, fill: '#111827' },
  { t: 'ellipse', cx: 20, cy: 8.4, rx: 1.9, ry: 1.1, fill: '#FDE68A' },
  { t: 'ellipse', cx: 12.3, cy: 8.8, rx: 1.3, ry: 0.9, fill: '#1F2937' },
  { t: 'ellipse', cx: 27.7, cy: 8.8, rx: 1.3, ry: 0.9, fill: '#1F2937' },
  { t: 'rect', x: 10.6, y: 10.2, w: 18.8, h: 2, r: 1, fill: '#1F2937' },
  { t: 'rect', x: 9.4, y: 9.8, w: 2.6, h: 2.8, r: 1.1, fill: '#111827' },
  { t: 'rect', x: 28, y: 9.8, w: 2.6, h: 2.8, r: 1.1, fill: '#111827' },
  { t: 'path', d: 'M16.4 12.4 Q20 10.6 23.6 12.4 L22.8 18.4 Q20 19.6 17.2 18.4 Z', fill: '#1F4FD8', stroke: '#FFFFFF', sw: 0.8 },
  { t: 'path', d: 'M17.4 18.2 L22.6 18.2 L23 29.8 Q20 32.6 17 29.8 Z', fill: '#111827' },
  { t: 'path', d: 'M17.8 26.2 L22.2 26.2 L22.6 30 Q20 31.9 17.4 30 Z', fill: '#1F4FD8' },
  { t: 'rect', x: 23.6, y: 24, w: 1.8, h: 7.4, r: 0.9, fill: '#9CA3AF' },
  { t: 'path', d: 'M15.4 20 L10.3 12 L12.5 11 L17.6 18 Z', fill: '#0F3AA8' },
  { t: 'path', d: 'M24.6 20 L29.7 12 L27.5 11 L22.4 18 Z', fill: '#0F3AA8' },
  { t: 'ellipse', cx: 20, cy: 21.4, rx: 5.8, ry: 4.3, fill: '#1F4FD8', stroke: '#0F3AA8', sw: 0.8 },
  { t: 'ellipse', cx: 20, cy: 18.8, rx: 3.9, ry: 4.1, fill: '#FFFFFF', stroke: '#111827', sw: 0.8 },
  { t: 'rect', x: 19.4, y: 14.8, w: 1.2, h: 8, r: 0.6, fill: '#F59E0B' },
  { t: 'path', d: 'M17 17.1 Q20 13.8 23 17.1 Q20 16 17 17.1 Z', fill: '#1F4FD8' },
];

export function scooterSvg(size = SCOOTER_BOX) {
  const line = (p) => (p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.sw || 1}"` : '');
  const parts = SCOOTER.map((p) => (p.t === 'rect'
    ? `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}" fill="${p.fill}"${line(p)}/>`
    : p.t === 'ellipse'
      ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${p.fill}"${line(p)}/>`
      : `<path d="${p.d}" fill="${p.fill}"${line(p)}/>`)).join('');
  return `<svg viewBox="0 0 ${SCOOTER_BOX} ${SCOOTER_BOX}" width="${size}" height="${size}" aria-hidden="true">${parts}</svg>`;
}

// Compass bearing from one point to the next, in degrees.
export function bearingOf(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
}
