/**
 * How soon someone can be at the door, the one way every screen says it (the
 * websites' ArrivalBadge). The 10-minute mark shows only when the estimate is
 * inside it; otherwise the honest number. Nothing when we do not know.
 */
import { StyleSheet, View } from 'react-native';
import { Clock, Zap } from 'lucide-react-native';
import { Text } from '..';
import { ink, slate, success } from '../../theme/colors';
import { radius } from '../../theme/radius';

export function ArrivalBadge({ minutes, withinPromise, busy = false, compact = false }: { minutes?: number | null; withinPromise?: boolean; busy?: boolean; compact?: boolean }) {
  if (minutes == null) return null;
  const label = minutes >= 90 ? `${Math.round(minutes / 60)} h` : `${minutes} min`;
  const fast = withinPromise && !busy;
  return (
    <View style={[styles.badge, { backgroundColor: fast ? success[600] : slate[100] }]}>
      {fast ? <Zap size={11} color="#fff" fill="#fff" /> : <Clock size={11} color={ink[700]} />}
      <Text variant="caption" weight={fast ? 'bold' : 'semibold'} color={fast ? '#fff' : ink[700]}>
        {compact ? `~${label}` : fast ? `Arrives in ~${label}` : `Can reach you in ~${label}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
