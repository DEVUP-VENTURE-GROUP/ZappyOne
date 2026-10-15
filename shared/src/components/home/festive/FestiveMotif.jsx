import { useMemo } from 'react';
import { MOTIF_BOX, motifShapes, motifGroups, motifRepeats } from '../../../customer/season';

const draw = (s, i) => (s.t === 'circle'
  ? <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} opacity={s.o ?? 1} />
  : <path key={i} d={s.d} fill={s.fill || 'none'} stroke={s.stroke || 'none'} strokeWidth={s.sw || 0} strokeLinecap="round" opacity={s.o ?? 1} />);

/**
 * The festival's decoration across the top of home (a jhalar, diya lights,
 * kites…), drawn and moved from the shared shapes so the app shows the same:
 * bells sway, lights twinkle, kites float (styles/index.css fz-*). Drawn at
 * phone scale; a pattern repeats across a wide screen rather than growing.
 */
export default function FestiveMotif({ theme }) {
  const groups = useMemo(() => motifGroups(motifShapes(theme)), [theme]);
  const copies = motifRepeats(theme) ? 6 : 1;
  return (
    <div aria-hidden="true" className="fz-drop pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-hidden">
      {Array.from({ length: copies }, (_, c) => (
        <svg key={c} viewBox={`0 0 ${MOTIF_BOX.w} ${MOTIF_BOX.h}`} width="412" height="110" className="shrink-0">
          {groups.map((g) => (
            <g key={g.key} className={g.anim ? `fz-${g.anim}` : undefined}
              style={g.anim ? { transformOrigin: `${g.px}px ${g.py}px`, animationDelay: `${g.delay}s` } : undefined}>
              {g.shapes.map(draw)}
            </g>
          ))}
        </svg>
      ))}
    </div>
  );
}
