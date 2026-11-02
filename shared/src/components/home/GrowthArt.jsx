import { GROWTH_BOX, GROWTH_BUILDINGS, GROWTH_COLORS as C, GROWTH_PIN, GROWTH_PIN_PATH, GROWTH_ROAD, GROWTH_STOPS, growthWindows } from '../../customer/growthArt';

const WINDOWS = growthWindows();

// A city skyline, the road ZappyOne is building along, the stops already live, and our pin settling on your spot.
export default function GrowthArt({ className = '' }) {
  const { x, y, ground } = GROWTH_PIN;
  return (
    <svg viewBox={`0 0 ${GROWTH_BOX.w} ${GROWTH_BOX.h}`} className={className} role="img" aria-label="ZappyOne growing towards your area">
      <ellipse cx="160" cy="118" rx="150" ry="96" fill={C.halo} />
      {GROWTH_BUILDINGS.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="3" fill={C[b.tone]} />)}
      {WINDOWS.map((w, i) => <rect key={`w${i}`} x={w.x} y={w.y} width={w.w} height={w.h} rx="1" fill={C.window} className={i % 5 === 0 ? 'fz-twinkle' : undefined} style={{ animationDelay: `${(i % 7) * 0.4}s` }} />)}
      <path d={GROWTH_ROAD} fill="none" stroke={C.road} strokeWidth="5" className="fz-marquee" />
      {GROWTH_STOPS.map((s, i) => (
        <g key={i}><circle cx={s.cx} cy={s.cy} r="9" fill={C.pin} /><circle cx={s.cx} cy={s.cy} r="3.5" fill={C.window} /></g>
      ))}
      <ellipse cx={ground.cx} cy={ground.cy} rx="18" ry="5" fill={C.shadow} opacity=".18" className="fz-breathe" />
      <g className="fz-bob">
        <g transform={`translate(${x} ${y})`}>
          <path d={GROWTH_PIN_PATH} fill={C.pin} />
          <path d="M0,-36 C20,-36 36,-20 36,0 C36,26 0,56 0,56 Z" fill={C.pinDark} opacity=".25" />
          <circle r="15" fill={C.window} />
          <circle r="6.5" fill={C.dot} />
        </g>
      </g>
    </svg>
  );
}
