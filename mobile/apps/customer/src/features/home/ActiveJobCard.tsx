/** Whatever is happening right now comes first: it is why most people open the app (the website's ActiveJobCard). */
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Button, Text } from '@zappy/ui/components';
import { accent, colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function ActiveJobCard({ job, onOpen }: { job: { title: string; stage?: string; needsYou?: boolean }; onOpen: () => void }) {
  const needsYou = !!job.needsYou;
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" style={styles.card}>
      <View style={styles.flex}>
        <View style={[styles.chip, { backgroundColor: needsYou ? accent[50] : zappy[50] }]}>
          <Text variant="caption" weight="semibold" color={needsYou ? accent[700] : zappy[700]}>{needsYou ? 'Needs your approval' : 'In progress'}</Text>
        </View>
        <Text variant="body" weight="semibold" numberOfLines={1} style={styles.cap}>{job.title}</Text>
        {job.stage ? <Text variant="caption" color={ink[500]} numberOfLines={1}>{job.stage}</Text> : null}
      </View>
      {needsYou ? <Button label="Review" size="small" onPress={onOpen} />
        : <View style={styles.track}><Text variant="bodySmall" weight="semibold" color={zappy[600]}>Track</Text><ChevronRight size={16} color={zappy[600]} /></View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  chip: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  cap: { textTransform: 'capitalize' },
  track: { flexDirection: 'row', alignItems: 'center' },
});
