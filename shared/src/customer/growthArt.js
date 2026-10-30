// The "we are growing to you" picture on not-in-your-area screens, as shapes, so the websites and the apps draw the same thing.
export const GROWTH_BOX = { w: 320, h: 210 };

export const GROWTH_COLORS = {
  halo: '#EEF3FD', far: '#DCE6FB', near: '#B9CCF7', window: '#FFFFFF',
  road: '#8EAAF0', pin: '#1F4FD8', pinDark: '#173891', dot: '#F59E0B', shadow: '#142F73',
};

// Two rows of buildings: the far one pale, the near one a step darker.
export const GROWTH_BUILDINGS = [
  { x: 22, y: 96, w: 34, h: 82, tone: 'far' }, { x: 60, y: 70, w: 28, h: 108, tone: 'far' },
  { x: 92, y: 104, w: 40, h: 74, tone: 'far' }, { x: 214, y: 86, w: 30, h: 92, tone: 'far' },
  { x: 248, y: 62, w: 34, h: 116, tone: 'far' }, { x: 286, y: 108, w: 22, h: 70, tone: 'far' },
  { x: 40, y: 124, w: 30, h: 54, tone: 'near' }, { x: 112, y: 132, w: 26, h: 46, tone: 'near' },
  { x: 232, y: 128, w: 28, h: 50, tone: 'near' }, { x: 268, y: 138, w: 30, h: 40, tone: 'near' },
];

export const growthWindows = () => GROWTH_BUILDINGS.filter((b) => b.tone === 'far').flatMap((b) => {
  const out = [];
  for (let y = b.y + 10; y < b.y + b.h - 16; y += 16) {
    for (let x = b.x + 6; x < b.x + b.w - 8; x += 11) out.push({ x, y, w: 5, h: 7 });
  }
  return out;
});

// The road the stops sit on, and the stops themselves: cities already live, then your spot under the pin.
export const GROWTH_ROAD = 'M6,184 C70,170 110,196 160,186 S260,170 314,182';
export const GROWTH_STOPS = [{ cx: 40, cy: 178 }, { cx: 96, cy: 184 }];
export const GROWTH_PIN = { x: 196, y: 54, ground: { cx: 196, cy: 178 } };
export const GROWTH_PIN_PATH = 'M0,-36 C20,-36 36,-20 36,0 C36,26 0,56 0,56 C0,56 -36,26 -36,0 C-36,-20 -20,-36 0,-36 Z';
