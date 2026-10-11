/** A pet's permanent record (the website's PetDetailPage): who they are, allergies and needs, and every completed service. */
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, PawPrint } from 'lucide-react-native';
import { useMyPetHistoryQuery } from '@zappy/core/api';
import { formatPaise } from '@zappy/core/shared/money';
import { EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function PetDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { data, isLoading } = useMyPetHistoryQuery(id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/pet' as never));

  if (isLoading) return <LoadingState />;
  const pet = data?.pet;
  if (!pet) return <View style={[styles.page, { paddingTop: insets.top }]}><ScreenHeader title={t('pet.title', 'Pet Services')} onBack={back} /><EmptyState title={t('pet.notFound', 'Pet not found')} /></View>;
  const history: { _id: string; service: string; at: string; notes?: string; amountPaise?: number }[] = data.history || [];
  const photo = webAsset(pet.photoKey);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={pet.name} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={[styles.card, styles.row]}>
          <View style={styles.photo}>{photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} /> : <PawPrint size={26} color={zappy[400]} />}</View>
          <View style={styles.flex}>
            <Text variant="heading3" weight="black">{pet.name}</Text>
            <Text variant="bodySmall" color={ink[500]} style={styles.cap}>{[pet.species, pet.breed, pet.size?.replace('_', ' ')].filter(Boolean).join(' · ')}</Text>
            {pet.weight ? <Text variant="caption" color={ink[400]}>{pet.weight} kg</Text> : null}
          </View>
        </View>
        {pet.allergies?.length || pet.specialNeeds ? (
          <View style={[styles.card, styles.warn]}>
            {pet.allergies?.length ? <Text variant="bodySmall"><Text variant="bodySmall" weight="bold">{t('pet.allergies', 'Allergies')}: </Text>{pet.allergies.join(', ')}</Text> : null}
            {pet.specialNeeds ? <Text variant="bodySmall"><Text variant="bodySmall" weight="bold">{t('pet.needs', 'Special needs')}: </Text>{pet.specialNeeds}</Text> : null}
          </View>
        ) : null}
        <View style={styles.row}><Calendar size={13} color={ink[500]} /><Text variant="caption" weight="bold" color={ink[500]}>{t('pet.history', 'SERVICE HISTORY')}</Text></View>
        {!history.length ? <Text variant="bodySmall" color={ink[400]} style={styles.center}>{t('pet.noHistory', 'No completed services yet.')}</Text> : history.map((h) => (
          <View key={h._id} style={[styles.card, styles.row]}>
            <View style={styles.flex}>
              <Text variant="bodySmall" weight="bold">{h.service}</Text>
              <Text variant="caption" color={ink[400]}>{new Date(h.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
              {h.notes ? <Text variant="caption" color={ink[500]}>{h.notes}</Text> : null}
            </View>
            {h.amountPaise != null ? <Text variant="bodySmall" weight="bold">{formatPaise(h.amountPaise)}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { gap: 4, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photo: { width: 64, height: 64, borderRadius: radius.large, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0 },
  cap: { textTransform: 'capitalize' },
  warn: { borderColor: accent[100], backgroundColor: accent[50] },
  center: { textAlign: 'center', paddingVertical: spacing.lg },
});
