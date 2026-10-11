/** Where a ticket or dispute stands, as a dotted pill; `meta` is that case type's status table. */
import { StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { radius } from '@zappy/ui/theme/radius';
import { STATUS } from './ticketMeta';

export function StatusBadge({ status, meta = STATUS }: { status: string; meta?: Record<string, { label: string; bg: string; fg: string }> }) {
  const t = useT();
  const m = meta[status] || meta.open;
  return (
    <View style={[styles.pill, { backgroundColor: m.bg }]}>
      <View style={[styles.dot, { backgroundColor: m.fg }]} />
      <Text variant="caption" weight="bold" color={m.fg}>{t(`ticket.${status}`, m.label)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
