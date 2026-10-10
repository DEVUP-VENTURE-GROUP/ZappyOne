/**
 * Earnings for the last seven days as bars.
 */
import React from 'react';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { zappy, ink, slate } from '../../theme/colors';

/* The week's earnings as a small line chart (whole rupees). */
export function WeekChart({ points }: { points: { label: string; value: number }[] }) {
  const W = 320; const H = 120; const padL = 34; const padR = 8; const padT = 10; const padB = 22;
  const max = Math.max(1, ...points.map((p) => p.value));
  const niceMax = max <= 1 ? 1 : Math.ceil(max / 100) * 100;
  const innerW = W - padL - padR; const innerH = H - padT - padB;
  const x = (i: number) => padL + (innerW * i) / (points.length - 1 || 1);
  const y = (v: number) => padT + innerH - (innerH * v) / niceMax;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');
  const ticks = [0, niceMax / 2, niceMax];
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} accessibilityLabel="Earnings this week">
      {ticks.map((t) => (
        <React.Fragment key={t}>
          <Line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={slate[200]} strokeWidth={1} />
          <SvgText x={0} y={y(t) + 3} fontSize={9} fill={ink[400]} fontWeight="600">
            {t >= 1000 ? `₹${(t / 1000).toFixed(1)}k` : `₹${t % 1 === 0 ? t : t.toFixed(1)}`}
          </SvgText>
        </React.Fragment>
      ))}
      <Path d={line} fill="none" stroke={zappy[600]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <React.Fragment key={p.label + i}>
          <Circle cx={x(i)} cy={y(p.value)} r={3.5} fill="#fff" stroke={zappy[600]} strokeWidth={2} />
          <SvgText x={x(i)} y={H - 6} fontSize={9} fill={ink[400]} fontWeight="600" textAnchor="middle">{p.label}</SvgText>
        </React.Fragment>
      ))}
    </Svg>
  );
}
