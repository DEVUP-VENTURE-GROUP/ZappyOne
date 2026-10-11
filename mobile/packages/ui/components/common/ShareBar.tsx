/** A thin bar that fills to `value / max` (the websites' spending and progress bars). */
import { StyleSheet, View } from 'react-native';
import { slate, zappy } from '../../theme/colors';

export function ShareBar({ value, max, color = zappy[500] }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <View style={styles.track}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} /></View>;
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: slate[100] },
  fill: { height: '100%', borderRadius: 4 },
});
