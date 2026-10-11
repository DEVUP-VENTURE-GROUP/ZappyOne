/**
 * One décor theme (the website's EventThemePage): its photos, price, setup
 * time and capacity, what is and is not included, and the decorator. Booking
 * finishes on the website, where the advance is paid.
 */
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Calendar, Check, Clock, Heart, MapPin, PartyPopper, Play, Star, Users, X } from 'lucide-react-native';
import { useGetEventThemeQuery } from '@zappy/core/api';
import { Button, EmptyState, Skeleton, Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { openLink } from '@zappy/ui/lib/openLink';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, danger, ink, navy, slate, success, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { bookThemeOnWeb } from './bookOnWeb';
import { rupees } from './ThemeCard';
import { ThemeFact as Fact } from './ThemeFact';
import { useSaveTheme } from './useSaveTheme';

export function EventThemePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useGetEventThemeQuery(id, { skip: !id });
  const save = useSaveTheme();
  const [idx, setIdx] = useState(0);
  const theme = data?.theme;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/events/browse' as never));

  if (isLoading) {
    return <View style={[styles.page, styles.pad, { paddingTop: insets.top + spacing.xl }]}><Skeleton height={300} borderRadius={radius.large} /><Skeleton height={48} /><Skeleton height={120} borderRadius={radius.large} /></View>;
  }
  if (!theme) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <EmptyState icon={<PartyPopper size={36} color={danger[400]} />} title={t('events.gone', 'This theme is no longer available')} actionLabel={t('common.back', 'Go back')} onAction={back} />
      </View>
    );
  }

  const media: string[] = [theme.coverImage, ...(theme.gallery || [])].map(webAsset).filter(Boolean) as string[];
  const partner = theme.partnerId;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={[styles.hero, { marginTop: insets.top }]}>
          {media[idx] ? <Image source={{ uri: media[idx] }} style={StyleSheet.absoluteFill} /> : <PartyPopper size={48} color={zappy[300]} />}
          {theme.videoUrl ? (
            <Pressable onPress={() => openLink(webAsset(theme.videoUrl) || theme.videoUrl, 'Could not play the video.')} accessibilityRole="button" style={styles.videoBtn}>
              <Play size={14} color={zappy[600]} fill={zappy[600]} /><Text variant="caption" weight="bold">{t('events.playVideo', 'Play video')}</Text>
            </Pressable>
          ) : null}
        </View>
        {media.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
            {media.map((uri, i) => (
              <Pressable key={uri} onPress={() => setIdx(i)} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}`} style={[styles.thumb, i === idx ? styles.thumbOn : styles.thumbOff]}>
                <Image source={{ uri }} style={StyleSheet.absoluteFill} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.pad}>
          <View style={styles.tags}>
            <View style={[styles.tag, { backgroundColor: zappy[50] }]}><Text variant="caption" weight="black" color={zappy[600]}>{(theme.categoryId?.name || 'Exclusive').toUpperCase()}</Text></View>
            {theme.cities?.[0] ? <View style={styles.tag}><MapPin size={11} color={ink[500]} /><Text variant="caption" weight="bold" color={ink[700]}>{theme.cities[0]}</Text></View> : null}
            <View style={[styles.tag, { backgroundColor: accent[50] }]}><Star size={11} color={accent[500]} fill={accent[500]} /><Text variant="caption" weight="bold" color={accent[700]}>{theme.rating ? theme.rating.toFixed(1) : 'NEW'} ({theme.reviewCount || 0})</Text></View>
          </View>
          <Text variant="heading1" weight="black">{theme.title}</Text>

          <View style={styles.card}>
            <Text variant="caption" weight="bold" color={ink[400]}>{t('events.package', 'TOTAL PACKAGE')}</Text>
            <Text variant="display" weight="black">{rupees(theme.startingPricePaise)}</Text>
            {theme.bookingCount ? <Text variant="caption" weight="semibold" color={ink[500]}>{theme.bookingCount} {t('events.booked', 'booked')}</Text> : null}
          </View>

          {theme.setupDurationMinutes || theme.guestCapacity?.max ? (
            <View style={styles.row}>
              {theme.setupDurationMinutes ? <Fact icon={<Clock size={18} color={zappy[600]} />} label={t('events.setup', 'Setup time')} value={`${theme.setupDurationMinutes} mins`} /> : null}
              {theme.guestCapacity?.max ? <Fact icon={<Users size={18} color={zappy[600]} />} label={t('events.capacity', 'Capacity')} value={`Up to ${theme.guestCapacity.max}`} /> : null}
            </View>
          ) : null}

          {theme.description ? (
            <View style={styles.card}>
              <Text variant="heading3" weight="black">{t('events.experience', 'The experience')}</Text>
              <Text variant="body" color={ink[700]}>{theme.description}</Text>
            </View>
          ) : null}

          {theme.includedItems?.length ? (
            <View style={styles.card}>
              <Text variant="heading3" weight="black">{t('events.included', 'Included')}</Text>
              {theme.includedItems.map((item: string) => <View key={item} style={styles.item}><Check size={14} color={success[600]} /><Text variant="bodySmall" color={ink[700]} style={styles.flex}>{item}</Text></View>)}
            </View>
          ) : null}
          {theme.excludedItems?.length ? (
            <View style={styles.card}>
              <Text variant="heading3" weight="black">{t('events.notIncluded', 'Not included')}</Text>
              {theme.excludedItems.map((item: string) => <View key={item} style={styles.item}><X size={14} color={ink[400]} /><Text variant="bodySmall" color={ink[500]} style={styles.flex}>{item}</Text></View>)}
            </View>
          ) : null}

          {partner ? (
            <View style={[styles.card, styles.partner]}>
              <View style={styles.initial}><Text variant="heading2" weight="black">{partner.businessName?.[0]?.toUpperCase()}</Text></View>
              <View style={styles.flex}>
                <Text variant="heading3" weight="black" color="#fff">{partner.businessName}</Text>
                <Text variant="caption" weight="bold" color={slate[300]}>★ {partner.reviewCount ? Number(partner.rating).toFixed(1) : 'New'} · {partner.completedEvents || 0} {t('events.hosted', 'hosted')}</Text>
                {partner.bio ? <Text variant="bodySmall" color={slate[200]}>{partner.bio}</Text> : null}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={styles.round}><ArrowLeft size={20} color={ink[700]} /></Pressable>
        <Pressable onPress={() => save(theme._id)} accessibilityRole="button" accessibilityLabel={theme.isSaved ? 'Remove from saved' : 'Save'} style={[styles.round, theme.isSaved && { backgroundColor: danger[50] }]}>
          <Heart size={20} color={theme.isSaved ? danger[500] : ink[700]} fill={theme.isSaved ? danger[500] : 'transparent'} />
        </Pressable>
      </View>

      <View style={[styles.cta, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text variant="caption" color={ink[500]} style={styles.note}>{t('events.payOnWeb', 'An advance locks your date. Booking and payment finish on zappyone.com.')}</Text>
        <View style={styles.row}>
          <Button label={t('events.later', 'Later')} variant="secondary" icon={<Calendar size={16} color={ink[900]} />} onPress={() => bookThemeOnWeb(theme._id, true)} style={styles.flex} />
          <Button label={t('events.bookNow', 'Book now')} onPress={() => bookThemeOnWeb(theme._id)} style={styles.grow} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: 'center' },
  pad: { gap: spacing.md, padding: spacing.base },
  flex: { flex: 1 },
  grow: { flex: 1.5 },
  hero: { height: 320, marginHorizontal: spacing.base, overflow: 'hidden', borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  videoBtn: { position: 'absolute', left: spacing.md, bottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: '#fff' },
  thumbs: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingTop: spacing.md },
  thumb: { width: 64, height: 64, overflow: 'hidden', borderRadius: radius.medium, borderWidth: 2 },
  thumbOn: { borderColor: zappy[500] },
  thumbOff: { borderColor: 'transparent', opacity: 0.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.small, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  partner: { flexDirection: 'row', alignItems: 'center', gap: spacing.base, backgroundColor: navy[900], borderColor: navy[900] },
  initial: { width: 56, height: 56, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  topBar: { position: 'absolute', left: spacing.xl, right: spacing.xl, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: colors.border },
  cta: { gap: spacing.sm, paddingHorizontal: spacing.base, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  note: { textAlign: 'center' },
});
