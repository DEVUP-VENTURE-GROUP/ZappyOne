/**
 * The quieter rows of Home (the website's HomeRails). Each renders only when it
 * has something real to show; an empty row is worse than no row.
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useGetAvailablePromosQuery } from '@zappy/core/api';
import { offerHeadline, offerTerms } from '@zappy/core/shared/season';
import { Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { accent, colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.title}>
      <Text variant="heading3" weight="bold">{title}</Text>
      {action ? <Pressable onPress={onAction} hitSlop={8} style={styles.action}><Text variant="caption" weight="semibold" color={zappy[600]}>{action}</Text><ChevronRight size={15} color={zappy[600]} /></Pressable> : null}
    </View>
  );
}

interface Promo { code: string; name: string; type: string; discountValue: number; maxDiscountPaise?: number; minOrderPaise?: number; alreadyUsed?: boolean }
// The amount alone ("20%", "₹100"); the card prints "off" under it.
const headline = (p: Promo) => offerHeadline(p).replace(/ off$/, '');
const terms = (p: Promo) => offerTerms(p);

/** Live codes this customer can still use. Tap one to see its code. */
export function OffersRail({ isAuthed }: { isAuthed: boolean }) {
  const { data } = useGetAvailablePromosQuery(undefined, { skip: !isAuthed });
  const promos: Promo[] = (data?.promos || []).filter((p: Promo) => !p.alreadyUsed);
  if (!promos.length) return null;
  return (
    <View style={styles.section}>
      <SectionTitle title="Offers" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {promos.slice(0, 6).map((p) => (
          <Pressable key={p.code} onPress={() => toast(`Use code ${p.code} at checkout`)} accessibilityRole="button" accessibilityLabel={`${headline(p)} off, code ${p.code}`} style={styles.offer}>
            <View style={styles.offerLeft}>
              <Text variant="heading3" weight="bold" color="#fff">{headline(p)}</Text>
              <Text variant="caption" weight="semibold" color="#fff">OFF</Text>
            </View>
            <View style={styles.offerBody}>
              <Text variant="bodySmall" weight="semibold" numberOfLines={1}>{p.name}</Text>
              {terms(p) ? <Text variant="caption" color={ink[500]}>{terms(p)}</Text> : null}
              <Text variant="caption" weight="bold" color={accent[700]} style={styles.code}>{p.code}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Things they've had done before, one tap from booking again. */
export function BookAgainRail({ items }: { items: { key: string; title: string; href: string; date?: string }[] }) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <SectionTitle title="Book again" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map(({ key, title, href, date }) => (
          <Pressable key={key} onPress={() => router.push(href as never)} accessibilityRole="button" style={styles.again}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={styles.cap}>{title}</Text>
              <Text variant="caption" color={ink[500]}>{date ? new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Before'}</Text>
            </View>
            <Text variant="caption" weight="semibold" color={zappy[600]}>Rebook</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function NearbyShopsLink() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push('/nearby-shops' as never)} accessibilityRole="button" style={styles.link}>
      <View style={styles.flex}>
        <Text variant="body" weight="semibold">Prefer to walk in?</Text>
        <Text variant="caption" color={ink[500]}>See verified repair shops near you</Text>
      </View>
      <ChevronRight size={18} color={ink[400]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  section: { gap: spacing.md },
  title: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  action: { flexDirection: 'row', alignItems: 'center' },
  row: { gap: spacing.md, paddingRight: spacing.base },
  offer: { width: 270, flexDirection: 'row', overflow: 'hidden', borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  offerLeft: { width: 92, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.base, backgroundColor: accent[500], borderRightWidth: 2, borderRightColor: '#fff', borderStyle: 'dotted' },
  offerBody: { flex: 1, justifyContent: 'center', gap: 2, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  code: { letterSpacing: 1.5, marginTop: 4 },
  again: { width: 200, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, paddingHorizontal: spacing.base, paddingVertical: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
