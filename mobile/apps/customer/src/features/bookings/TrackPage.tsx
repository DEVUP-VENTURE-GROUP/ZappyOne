/**
 * The Track tab (the website's TrackPage): if something is happening, go and
 * watch it; otherwise say so and offer a way to book. "Happening" is decided
 * by useMyJobs, the same way Home and Activity decide it.
 */
import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, MapPin, Zap } from 'lucide-react-native';
import { useMyJobs } from '@zappy/core/shared/useMyJobs';
import { Button, LoadingState, Text } from '@zappy/ui/components';
import { useT } from '@zappy/ui/lib/i18n';
import { colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function TrackPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { current, isLoading } = useMyJobs() as { current: { href: string } | null; isLoading: boolean };

  // A live job opens straight away, once: coming Back lands here, not in a loop.
  const opened = useRef<string | null>(null);
  useFocusEffect(useCallback(() => {
    if (!current || opened.current === current.href) return;
    opened.current = current.href;
    router.push(current.href as never);
  }, [current, router]));

  if (isLoading) return <LoadingState />;
  return (
    <View style={[styles.page, { paddingTop: insets.top + spacing.lg }]}>
      <Text variant="heading2" weight="black">{t('track.title', 'Track Order')}</Text>
      <View style={styles.center}>
        <View style={styles.icon}><MapPin size={36} strokeWidth={1.5} color={zappy[600]} /></View>
        <Text variant="heading3" weight="bold">{current ? t('track.live', 'Your booking is live') : t('track.noActive', 'No active order')}</Text>
        <Text variant="bodySmall" color={ink[400]} style={styles.text}>{current ? t('track.liveHint', 'Follow your pro on the map and see every update.') : t('track.hint', 'Live tracking appears here while a booking is in progress. Book a service to get started.')}</Text>
        <View style={styles.actions}>
          {current ? <Button label={t('activity.track', 'Track')} icon={<MapPin size={15} color="#fff" />} onPress={() => router.push(current.href as never)} fullWidth /> : null}
          <Button label={t('track.bookService', 'Book a Service')} variant={current ? 'outline' : 'primary'} icon={<Zap size={15} color={current ? ink[700] : '#fff'} />} onPress={() => router.push('/services' as never)} fullWidth />
          <Button label={t('track.viewPast', 'View Past Bookings')} variant="secondary" icon={<ChevronRight size={14} color={ink[700]} />} onPress={() => router.push('/orders' as never)} fullWidth />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: spacing.lg, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingBottom: 80 },
  icon: { width: 80, height: 80, borderRadius: radius.large, alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  text: { textAlign: 'center', maxWidth: 300 },
  actions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.md },
});
