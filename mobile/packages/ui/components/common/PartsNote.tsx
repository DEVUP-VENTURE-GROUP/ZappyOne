// The parts rule in one line (shared partsRule): customers before booking, partners while pricing; nothing for trades without parts.
import { StyleSheet, View } from 'react-native';
import { EyeOff, ShieldCheck } from 'lucide-react-native';
import { useRepairVerticalsQuery } from '@zappy/core/api';
import { PARTS_NOTE, PRIVACY_PLEDGE, partsQuotedSeparately } from '@zappy/core/shared/partsRule';
import { Text } from '../Text';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { ink, zappy } from '../../theme/colors';

export function PartsNote({ vertical, who }: { vertical: string; who: 'customer' | 'partner' }) {
  const { data } = useRepairVerticalsQuery(undefined);
  if (!partsQuotedSeparately(vertical, data?.items || [])) return null;
  return (
    <View style={styles.note}>
      <ShieldCheck size={15} color={zappy[700]} />
      <Text variant="caption" weight="semibold" color={zappy[800]} style={styles.flex}>{PARTS_NOTE[who]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.medium, borderWidth: 1, borderColor: zappy[100], backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0 },
  pledge: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.xs },
});

// ZappyOne's privacy promise, the same words on web and app (shared partsRule).
export function PrivacyPledge({ who }: { who: 'customer' | 'partner' }) {
  return (
    <View style={styles.pledge}>
      <EyeOff size={14} color={ink[500]} />
      <Text variant="caption" weight="semibold" color={ink[500]} style={styles.flex}>{PRIVACY_PLEDGE[who]}</Text>
    </View>
  );
}
