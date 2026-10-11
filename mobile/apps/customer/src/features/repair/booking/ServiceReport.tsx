/** The service report for a finished repair (the website's ServiceReport): what was found, what was done, before and after photos. */
import { StyleSheet, View } from 'react-native';
import { Download } from 'lucide-react-native';
import { Button, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { useOpenDocument } from '@zappy/ui/lib/openDocument';
import { colors, ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function ServiceReport({ booking }: { booking: { _id: string; status: string } }) {
  const t = useT();
  const { open, opening } = useOpenDocument();
  if (booking.status !== 'COMPLETED') return null;
  const path = `/api/repair/bookings/${booking._id}/report`;
  return (
    <View style={styles.card}>
      <Text variant="caption" weight="bold" color={ink[500]}>{t('report.title', 'SERVICE REPORT')}</Text>
      <Text variant="caption" color={ink[700]}>{t('report.body', 'What the technician found, what was done, and the before and after photos.')}</Text>
      <Button label={t('report.view', 'View report')} variant="secondary" size="small" loading={opening === path} icon={<Download size={15} color={ink[700]} />} onPress={() => open(path)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
