/** Where a past job ended, as a quiet tinted pill (the website's StatusPill); anything else is plain text. */
import { StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { danger, ink, slate, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import type { MyJob } from './types';

const TONE = { completed: [success[50], success[700]], cancelled: [slate[100], ink[500]], failed: [danger[50], danger[600]] } as const;

export function StatusPill({ job }: { job: MyJob }) {
  const t = useT();
  const label = t(job.statusKey, job.stage);
  const tone = job.outcome ? TONE[job.outcome] : null;
  if (!tone) return <Text variant="caption" weight="semibold" color={ink[500]}>{label}</Text>;
  return <View style={[styles.pill, { backgroundColor: tone[0] }]}><Text variant="caption" weight="bold" color={tone[1]}>{label}</Text></View>;
}

const styles = StyleSheet.create({ pill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 } });
