/**
 * Who is doing the job, once someone is (the website's WorkerRichCard): name,
 * rating, jobs done, verified, and one tap to call, chat or follow them live.
 * Only the actions this job supports are shown.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { MessageCircle, Navigation, Phone, ShieldCheck, Star } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Avatar, Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { accent, colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { EtaStrip } from '../cards/EtaStrip';
import type { TrackedJob } from '../types';

const TONES = { g: [success[50], success[600]], b: [zappy[50], zappy[700]], v: ['#EFEAFE', '#7C3AED'] } as const;

export function WorkerRichCard({ job, eta, onCall, onChat, onLive }: { job: TrackedJob; eta: number | null; onCall?: () => void; onChat?: () => void; onLive?: () => void }) {
  const p = job.provider || {};
  const tiles = ([
    onCall && { key: 'call', label: 'Call', tone: 'g', Icon: Phone, onPress: onCall },
    onChat && { key: 'chat', label: 'Chat', tone: 'b', Icon: MessageCircle, onPress: onChat },
    onLive && { key: 'live', label: 'Live', tone: 'v', Icon: Navigation, onPress: onLive },
  ].filter(Boolean)) as { key: string; label: string; tone: keyof typeof TONES; Icon: LucideIcon; onPress: () => void }[];

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Avatar name={p.name || 'Pro'} size={58} />
        <View style={styles.flex}>
          <View style={styles.inline}>
            <Text variant="heading3" weight="black" numberOfLines={1} style={styles.shrink}>{p.name || `Your ${job.noun}`}</Text>
            <View style={styles.verified}><ShieldCheck size={11} color={success[700]} /><Text variant="caption" weight="black" color={success[700]}>Verified</Text></View>
          </View>
          <Text variant="caption" color={ink[500]} style={styles.cap}>{p.from ? `from ${p.from}` : `Verified ZappyOne ${job.noun}`}</Text>
        </View>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}><View style={styles.inline}><Star size={14} color={accent[500]} fill={accent[500]} /><Text variant="body" weight="black">{p.rating != null ? Number(p.rating).toFixed(1) : 'New'}</Text></View><Text variant="caption" color={ink[500]}>Rating</Text></View>
        <View style={styles.stat}><Text variant="body" weight="black">{p.jobs != null ? String(p.jobs) : '-'}</Text><Text variant="caption" color={ink[500]}>Jobs done</Text></View>
        <View style={styles.stat}><View style={styles.inline}><ShieldCheck size={14} color={success[600]} /><Text variant="body" weight="black">ID</Text></View><Text variant="caption" color={ink[500]}>Verified</Text></View>
      </View>
      {tiles.length ? (
        <View style={styles.stats}>
          {tiles.map(({ key, label, tone, Icon, onPress }) => (
            <Pressable key={key} onPress={onPress} android_ripple={RIPPLE} accessibilityRole="button" accessibilityLabel={label} style={styles.stat}>
              <View style={[styles.tileIcon, { backgroundColor: TONES[tone][0] }]}><Icon size={18} color={TONES[tone][1]} /></View>
              <Text variant="caption" weight="bold" color={ink[700]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {['assigned', 'on_the_way', 'arrived'].includes(job.status) ? <EtaStrip etaMinutes={eta} arrived={job.status === 'arrived'} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.base, padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shrink: { flexShrink: 1 },
  cap: { textTransform: 'capitalize', marginTop: 2 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.small, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: success[50] },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.md, borderRadius: radius.large, backgroundColor: slate[50] },
  tileIcon: { width: 38, height: 38, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center' },
});
