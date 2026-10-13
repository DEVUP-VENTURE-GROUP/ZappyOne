/**
 * A booking they started and left (jobs/checkout-draft; the website's
 * ContinueBookingCard): the newest one, its price, and the way back to where
 * they stopped. Dismissing it forgets it. Nothing shows for guests or when
 * there is nothing unfinished.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, X } from 'lucide-react-native';
import { useClearCheckoutDraftMutation, useMyCheckoutDraftsQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Draft { kind: string; title: string; path: string; pricePaise: number | null }

export function ContinueBookingCard({ isAuthed }: { isAuthed: boolean }) {
  const router = useRouter();
  const { data } = useMyCheckoutDraftsQuery(undefined, { skip: !isAuthed });
  const [clear] = useClearCheckoutDraftMutation();
  const d: Draft | undefined = data?.drafts?.[0];
  if (!d) return null;
  return (
    <View style={styles.card}>
      <Pressable onPress={() => router.push(d.path as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.main}>
        <View style={styles.flex}>
          <Text variant="caption" weight="bold" color={zappy[700]}>CONTINUE YOUR BOOKING</Text>
          <Text variant="body" weight="bold" numberOfLines={1} style={styles.title}>{d.title}</Text>
          <Text variant="caption" color={ink[500]}>{[d.pricePaise ? formatPaise(d.pricePaise) : null, 'everything you picked is saved'].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={styles.go}><ArrowRight size={18} color="#fff" /></View>
      </Pressable>
      <Pressable onPress={() => clear(d.kind).catch(() => {})} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} style={styles.close}>
        <X size={16} color={ink[400]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.base, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: zappy[100], backgroundColor: zappy[50] },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  title: { textTransform: 'capitalize' },
  go: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[600] },
  close: { padding: 4 },
});
