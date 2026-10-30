/**
 * A provider's public profile (the website's WorkerProfilePage): who they are,
 * what ZappyOne verified them for, the rating spread and what customers said.
 * Every number comes from a record; with no record yet the page says "New".
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, Briefcase, CalendarDays, MessageSquareQuote, ShieldCheck, Star, type LucideIcon } from 'lucide-react-native';
import { useGetWorkerPublicProfileQuery } from '@zappy/core/api';
import { Avatar, Button, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { ShareBar } from '@zappy/ui/components/common/ShareBar';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

const since = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-');
function ago(d?: string) {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days < 1) return 'Today';
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const Stars = ({ value, size = 14 }: { value: number; size?: number }) => (
  <View style={styles.inline}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} color={n <= Math.round(value) ? accent[500] : slate[200]} fill={n <= Math.round(value) ? accent[500] : 'transparent'} />)}</View>
);

function Fact({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) {
  return (
    <View style={[styles.card, styles.fact]}>
      <View style={styles.factIcon}><Icon size={17} color={ink[700]} /></View>
      <View style={styles.flex}><Text variant="caption" color={ink[500]}>{label}</Text><Text variant="bodySmall" weight="semibold" numberOfLines={1}>{value}</Text></View>
    </View>
  );
}

interface Review { id?: string; by?: string; at?: string; rating: number; service?: string; text: string }

export function WorkerProfilePage() {
  const { workerId } = useLocalSearchParams<{ workerId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useGetWorkerPublicProfileQuery(workerId, { skip: !workerId });
  const w = data?.worker;
  const reviews: Review[] = data?.reviews ?? [];
  const name: string = w?.name ?? t('worker.yourPro', 'Your pro');
  const count: number = w?.ratingCount ?? 0;
  const rating: number | null = count ? w?.rating : null;
  const services: { code: string; name: string; path?: string }[] = w?.verifiedServices ?? [];
  const bookPath = services.find((s) => s.path)?.path || null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as never));

  if (isLoading) return <LoadingState />;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('worker.profile', 'Profile')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}>
        <View style={[styles.card, styles.who]}>
          <Avatar name={name} size={64} />
          <View style={styles.flex}>
            <Text variant="heading3" weight="bold" numberOfLines={1}>{name}</Text>
            <View style={styles.chips}>
              {w?.verified ? <View style={[styles.chip, { backgroundColor: success[50] }]}><ShieldCheck size={12} color={success[700]} /><Text variant="caption" weight="semibold" color={success[700]}>{t('worker.idVerified', 'ID verified')}</Text></View> : null}
              {rating != null
                ? <View style={[styles.chip, { backgroundColor: accent[50] }]}><Star size={12} color={accent[500]} fill={accent[500]} /><Text variant="caption" weight="semibold" color={accent[700]}>{Number(rating).toFixed(1)}, {count} {t('worker.ratings', 'ratings')}</Text></View>
                : <View style={[styles.chip, { backgroundColor: slate[100] }]}><Text variant="caption" weight="semibold" color={ink[700]}>{t('worker.new', 'New on ZappyOne')}</Text></View>}
            </View>
          </View>
        </View>
        <View style={styles.facts}>
          <Fact Icon={Briefcase} label={t('worker.jobs', 'Jobs completed')} value={w?.completedJobs ? Number(w.completedJobs).toLocaleString('en-IN') : t('worker.noneYet', 'None yet')} />
          <Fact Icon={CalendarDays} label={t('worker.since', 'On ZappyOne since')} value={since(w?.memberSince)} />
        </View>
        <View style={styles.card}>
          <Text variant="bodySmall" weight="bold">{t('worker.verifiedFor', 'Verified for')}</Text>
          <Text variant="caption" color={ink[500]}>{t('worker.verifiedHint', 'ZappyOne checked their documents for each of these.')}</Text>
          {services.length ? <View style={styles.chips}>{services.map((s) => <View key={s.code} style={[styles.chip, { backgroundColor: zappy[50] }]}><BadgeCheck size={13} color={zappy[700]} /><Text variant="caption" weight="semibold" color={zappy[700]}>{s.name}</Text></View>)}</View>
            : <Text variant="bodySmall" color={ink[500]}>{t('worker.noServices', 'No services verified yet.')}</Text>}
        </View>
        {count > 0 && w?.breakdown ? (
          <View style={styles.card}>
            <View style={styles.inline}><Text variant="heading1" weight="bold">{Number(rating).toFixed(1)}</Text><View><Stars value={rating || 0} /><Text variant="caption" color={ink[500]}>{count} {t('worker.ratings', 'ratings')}</Text></View></View>
            {[5, 4, 3, 2, 1].map((n) => (
              <View key={n} style={styles.inline}><Text variant="caption" color={ink[500]} style={styles.n}>{n}</Text><View style={styles.flex}><ShareBar value={w.breakdown[n] || 0} max={count} color={accent[500]} /></View><Text variant="caption" color={ink[500]} style={styles.c}>{w.breakdown[n] || 0}</Text></View>
            ))}
          </View>
        ) : null}
        <View style={styles.card}>
          <Text variant="bodySmall" weight="bold">{t('worker.said', 'What customers said')}</Text>
          {reviews.length ? reviews.map((r, i) => (
            <View key={r.id || i} style={[styles.review, i > 0 && styles.rule]}>
              <View style={styles.between}><Text variant="bodySmall" weight="semibold">{r.by || t('worker.customer', 'Customer')}</Text><Text variant="caption" color={ink[400]}>{ago(r.at)}</Text></View>
              <View style={styles.inline}><Stars value={r.rating} size={12} />{r.service ? <Text variant="caption" color={ink[500]} style={styles.cap}>{r.service}</Text> : null}</View>
              <Text variant="bodySmall" color={ink[700]}>{r.text}</Text>
            </View>
          )) : (
            <View style={styles.noReviews}><MessageSquareQuote size={18} color={ink[500]} /><Text variant="bodySmall" color={ink[500]} style={styles.flex}>{t('worker.noReviews', 'No written reviews yet. Reviews appear here after customers rate a finished job.')}</Text></View>
          )}
        </View>
      </ScrollView>
      <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.base }]}>
        <Button label={bookPath ? `${t('worker.bookAgain', 'Book')} ${name.split(' ')[0]} ${t('worker.again', 'again')}` : t('worker.seeServices', 'See services')}
          onPress={() => router.push((bookPath ? `${bookPath}?preferredWorker=${workerId}` : '/services') as never)} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  flex: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  facts: { flexDirection: 'row', gap: spacing.md },
  fact: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  factIcon: { width: 36, height: 36, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  n: { width: 12 },
  c: { width: 24, textAlign: 'right' },
  review: { gap: 4, paddingVertical: spacing.sm },
  rule: { borderTopWidth: 1, borderTopColor: colors.border },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  cap: { textTransform: 'capitalize' },
  noReviews: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.medium, backgroundColor: slate[50] },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
