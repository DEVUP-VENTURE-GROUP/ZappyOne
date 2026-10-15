/**
 * One moving part of the festive decoration (a toran strand, a light, a kite),
 * driven by the shared clock on the UI thread. The movements match the
 * website's (shared styles fz-*): sway, twinkle, flicker, float, breathe, fall.
 */
import { memo } from 'react';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { Circle, G, Path } from 'react-native-svg';

const AnimatedG = Animated.createAnimatedComponent(G);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** Seconds per full movement, as on the website. */
const PERIOD: Record<string, number> = { sway: 6.8, twinkle: 3.4, flicker: 1.8, float: 8.4, breathe: 10, fall: 6 };

function draw(s: Any, i: number) {
  return s.t === 'circle'
    ? <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} opacity={s.o ?? 1} />
    : <Path key={i} d={s.d} fill={s.fill || 'none'} stroke={s.stroke || 'none'} strokeWidth={s.sw || 0} strokeLinecap="round" opacity={s.o ?? 1} />;
}

export const FestiveMotifGroup = memo(function FestiveMotifGroup({ group, clock }: { group: Any; clock: SharedValue<number> | null }) {
  const { anim, px, py, delay } = group;
  const animatedProps = useAnimatedProps<Any>(() => {
    if (!anim || !clock) return {};
    const period = PERIOD[anim] || 6;
    // clock runs in seconds; each part has its own phase (delay).
    const phase = ((clock.value + delay) % period) / period;
    const wave = Math.sin(phase * Math.PI * 2); // -1..1, eased by nature
    const half = (wave + 1) / 2; // 0..1
    if (anim === 'sway') return { transform: `rotate(${wave * 3.5} ${px} ${py})` };
    if (anim === 'twinkle') return { opacity: 0.3 + half * 0.7 };
    if (anim === 'flicker') return { opacity: 0.8 + half * 0.2, transform: `translate(${px} ${py}) scale(${0.94 + half * 0.12} ${0.84 + half * 0.26}) translate(${-px} ${-py})` };
    if (anim === 'float') return { transform: `translate(${wave * 2.5} ${wave * 4.5}) rotate(${wave * 4} ${px} ${py})` };
    if (anim === 'breathe') return { transform: `translate(${px} ${py}) scale(${0.82 + half * 0.32}) translate(${-px} ${-py})` };
    if (anim === 'fall') return { opacity: phase < 0.15 ? phase / 0.15 : 1 - phase, transform: `translate(0 ${-8 + phase * 22})` };
    return {};
  });
  if (!anim || !clock) return <G>{group.shapes.map(draw)}</G>;
  return <AnimatedG animatedProps={animatedProps}>{group.shapes.map(draw)}</AnimatedG>;
});
