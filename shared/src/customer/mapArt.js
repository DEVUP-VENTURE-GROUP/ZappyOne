// A pro on the customer's map, drawn top-down like Uber's cars, and which way they are heading; websites and apps draw the same.
export const SCOOTER_BOX = 40;
// The ZappyOne rider seen from above, front up, rider-first like a delivery app's: thin front tyre, a wide black handlebar,
// arms spread to it, a round blue helmet, and the big blue ZappyOne box with its white Z; drawn back to front.
export const SCOOTER = [
  { t: 'ellipse', cx: 20, cy: 22, rx: 10.5, ry: 16.5, fill: 'rgba(16,24,40,0.16)' },
  { t: 'rect', x: 18.6, y: 35, w: 2.8, h: 4.2, r: 1.4, fill: '#1F2937' },
  { t: 'rect', x: 18.6, y: 1, w: 2.8, h: 8, r: 1.4, fill: '#1F2937' },
  { t: 'rect', x: 8.6, y: 8.6, w: 22.8, h: 2.6, r: 1.3, fill: '#1F2937' },
  { t: 'rect', x: 7.4, y: 8.2, w: 3.2, h: 3.4, r: 1.3, fill: '#111827' },
  { t: 'rect', x: 29.4, y: 8.2, w: 3.2, h: 3.4, r: 1.3, fill: '#111827' },
  { t: 'rect', x: 11.6, y: 22, w: 16.8, h: 14, r: 2.6, fill: '#1F4FD8', stroke: '#0F3AA8', sw: 1 },
  { t: 'rect', x: 14, y: 24.6, w: 12, h: 8.8, r: 1.6, fill: '#2C5DE5' },
  { t: 'path', d: 'M16.6 26.4 L23.4 26.4 L16.6 31.6 L23.4 31.6', fill: 'none', stroke: '#FFFFFF', sw: 1.8 },
  { t: 'path', d: 'M14.8 18.6 L10.4 11 L12.9 10.2 L17.4 16.4 Z', fill: '#1F4FD8', stroke: '#0F3AA8', sw: 0.6 },
  { t: 'path', d: 'M25.2 18.6 L29.6 11 L27.1 10.2 L22.6 16.4 Z', fill: '#1F4FD8', stroke: '#0F3AA8', sw: 0.6 },
  { t: 'ellipse', cx: 11.4, cy: 10.4, rx: 1.7, ry: 1.5, fill: '#111827' },
  { t: 'ellipse', cx: 28.6, cy: 10.4, rx: 1.7, ry: 1.5, fill: '#111827' },
  { t: 'ellipse', cx: 20, cy: 19, rx: 6.4, ry: 4.6, fill: '#1F4FD8', stroke: '#0F3AA8', sw: 0.8 },
  { t: 'ellipse', cx: 20, cy: 16.4, rx: 4.6, ry: 4.7, fill: '#1F4FD8', stroke: '#0F3AA8', sw: 0.9 },
  { t: 'rect', x: 19.4, y: 12, w: 1.2, h: 8.8, r: 0.6, fill: '#F59E0B' },
  { t: 'ellipse', cx: 18.4, cy: 14.6, rx: 1.4, ry: 1, fill: '#5B83EE' },
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
