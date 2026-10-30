import { Pressable, StyleSheet, View } from 'react-native';
import { MessageSquareText, Phone, ShieldCheck, Star } from 'lucide-react-native';
import { firstNameOf } from '@zappy/core/shared/trackingSteps';
import { Avatar, Text } from '@zappy/ui/components';
import { accent, colors, ink, slate, success } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import type { TrackedJob } from '../types';

// Who is coming, as Rapido shows the captain (the website's WorkerRichCard): name, rating and jobs, then call or message.
export function WorkerRichCard({ job, onCall, onChat }: { job: TrackedJob; onCall?: () => void; onChat?: () => void }) {
  const p = job.provider || {};
  const name = p.name || `Your ${job.noun}`;
  const facts = [p.jobs ? `${p.jobs} jobs` : null, p.from ? `from ${p.from}` : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <Avatar name={p.name || 'Pro'} size={54} />
        <View style={styles.flex}>
          <Text variant="bodyLarge" weight="bold" numberOfLines={1}>{name}</Text>
          <View style={styles.facts}>
            {p.rating != null ? (
              <View style={styles.inline}><Star size={13} color={accent[500]} fill={accent[500]} strokeWidth={0} /><Text variant="bodySmall" weight="semibold">{Number(p.rating).toFixed(1)}</Text></View>
            ) : <Text variant="bodySmall" weight="semibold">New</Text>}
            {facts ? <Text variant="bodySmall" color={ink[500]} numberOfLines={1} style={styles.flex}>· {facts}</Text> : null}
          </View>
          <View style={styles.inline}><ShieldCheck size={13} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>ID verified</Text></View>
        </View>
        {onCall ? (
          <Pressable onPress={onCall} accessibilityRole="button" accessibilityLabel={`Call ${name}`} style={styles.call}><Phone size={18} color={ink[900]} /></Pressable>
        ) : null}
      </View>
      {onChat ? (
        <Pressable onPress={onChat} accessibilityRole="button" style={({ pressed }) => [styles.message, pressed && styles.pressed]}>
          <MessageSquareText size={18} color={ink[900]} />
          <Text variant="body" color={ink[700]}>Message {firstNameOf(p.name) || name}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: spacing.base, backgroundColor: colors.surface, borderBottomWidth: 8, borderBottomColor: slate[100] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flex: { flex: 1, minWidth: 0 },
  facts: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  call: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: slate[200], alignItems: 'center', justifyContent: 'center' },
  message: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, marginTop: 14, paddingHorizontal: spacing.base, borderRadius: 22, borderWidth: 1, borderColor: slate[200] },
  pressed: { opacity: 0.6 },
});
