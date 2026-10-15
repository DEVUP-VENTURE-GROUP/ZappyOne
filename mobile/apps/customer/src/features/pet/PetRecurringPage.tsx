/** Recurring pet care (the website's PetRecurringPage): each standing schedule, with pause, resume and cancel. */
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pause, Play, Repeat, X } from 'lucide-react-native';
import { useCancelPetRecurringMutation, useMyPetRecurringQuery, usePausePetRecurringMutation, useResumePetRecurringMutation } from '@zappy/core/api';
import { Button, EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, danger, ink, slate, success } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

interface Schedule { _id: string; categoryCode: string; frequency: string; timeOfDay: string; status: string; occurrencesCreated: number; occurrencesCompleted: number }
const TONE: Record<string, [string, string]> = { active: [success[50], success[700]], paused: [accent[50], accent[700]] };

export function PetRecurringPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading, refetch } = useMyPetRecurringQuery(undefined);
  const [pause] = usePausePetRecurringMutation();
  const [resume] = useResumePetRecurringMutation();
  const [cancel] = useCancelPetRecurringMutation();
  const schedules: Schedule[] = data?.schedules || [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/pet' as never));

  async function act(fn: (id: string) => { unwrap: () => Promise<unknown> }, id: string, done: string) {
    try { await fn(id).unwrap(); toast.success(done); refetch(); }
    catch (err) { toast.error(errText(err, t('pet.updateFailed', 'Could not update. Try again.'))); }
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('pet.recurring', 'Recurring Care')} onBack={back} />
      {isLoading ? <LoadingState /> : !schedules.length ? (
        <EmptyState icon={<Repeat size={28} color={slate[300]} />} title={t('pet.noRecurring', 'No recurring schedule yet.')} message={t('pet.noRecurringHint', "Set one up from a booking's confirmation screen.")} />
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          {schedules.map((s) => {
            const [bg, fg] = TONE[s.status] || [slate[100], ink[500]];
            const live = s.status !== 'cancelled' && s.status !== 'completed';
            return (
              <View key={s._id} style={styles.card}>
                <View style={styles.top}>
                  <View style={styles.flex}>
                    <Text variant="bodySmall" weight="bold" style={styles.cap}>{s.categoryCode.replace(/_/g, ' ')}</Text>
                    <Text variant="caption" color={ink[500]} style={styles.cap}>{s.frequency.replace('_', ' ')} {t('pet.at', 'at')} {s.timeOfDay}</Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: bg }]}><Text variant="caption" weight="bold" color={fg}>{s.status.toUpperCase()}</Text></View>
                </View>
                <Text variant="caption" color={ink[400]}>{s.occurrencesCreated} {t('pet.scheduled', 'scheduled')}, {s.occurrencesCompleted} {t('pet.completed', 'completed')}</Text>
                {live ? (
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      {s.status === 'active'
                        ? <Button label={t('pet.pause', 'Pause')} size="small" variant="outline" icon={<Pause size={12} color={ink[700]} />} onPress={() => act(pause, s._id, t('pet.paused', 'Paused'))} fullWidth />
                        : <Button label={t('pet.resume', 'Resume')} size="small" variant="outline" icon={<Play size={12} color={success[700]} />} onPress={() => act(resume, s._id, t('pet.resumed', 'Resumed'))} fullWidth />}
                    </View>
                    <View style={styles.flex}><Button label={t('common.cancel', 'Cancel')} size="small" variant="dangerGhost" icon={<X size={12} color={danger[600]} />} onPress={() => act(cancel, s._id, t('pet.cancelled', 'Cancelled'))} fullWidth /></View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  cap: { textTransform: 'capitalize' },
  pill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  row: { flexDirection: 'row', gap: spacing.sm },
});
