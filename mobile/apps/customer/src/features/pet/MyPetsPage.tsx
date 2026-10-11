/**
 * My pets (the website's MyPetsPage): every profile, those missing the safety
 * answers flagged "finish profile to book", add a pet, remove one. Opened
 * with ?complete=<id> from a booking, it goes straight to that pet's questions.
 */
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PawPrint, Plus, Trash2 } from 'lucide-react-native';
import { useDeleteMyPetMutation, useMyPetsQuery } from '@zappy/core/api';
import { EmptyState, LoadingState, ScreenHeader, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText, RIPPLE } from '@zappy/ui/lib/feedback';
import { webAsset } from '@zappy/ui/lib/media';
import { useT } from '@zappy/ui/lib/i18n';
import { accent, colors, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { PetProfileSheet, type Pet } from './profile/PetProfileSheet';

export function MyPetsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const params = useLocalSearchParams<{ complete?: string }>();
  const { data, isLoading } = useMyPetsQuery(undefined);
  const [remove] = useDeleteMyPetMutation();
  const [showAdd, setShowAdd] = useState(false);
  const [finishing, setFinishing] = useState<Pet | null>(null);
  const pets: Pet[] = data?.pets || [];
  const toFinish = finishing || pets.find((p) => p._id === params.complete) || null;
  const closeFinish = () => { setFinishing(null); if (params.complete) router.setParams({ complete: undefined }); };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/pet' as never));

  async function drop(id: string) {
    try { await remove(id).unwrap(); toast.success(t('pets.removed', 'Removed')); }
    catch (err) { toast.error(errText(err, t('pets.removeFailed', 'Could not remove. Try again.'))); }
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('pet.quick.pets', 'My Pets')} onBack={back} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}>
        {isLoading ? <LoadingState /> : !pets.length ? <EmptyState icon={<PawPrint size={32} color={slate[300]} />} title={t('pets.none', 'No pets added yet.')} /> : pets.map((p) => {
          const photo = webAsset(p.photoKey);
          return (
            <Pressable key={p._id} onPress={() => router.push(`/pet/my-pets/${p._id}` as never)} android_ripple={RIPPLE} accessibilityRole="button" style={styles.card}>
              <View style={styles.photo}>{photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} /> : <PawPrint size={20} color={zappy[400]} />}</View>
              <View style={styles.flex}>
                <Text variant="bodySmall" weight="black">{p.name}</Text>
                <Text variant="caption" color={ink[500]} style={styles.cap}>{[p.species, p.breed, p.size.replace('_', ' ')].filter(Boolean).join(' · ')}</Text>
                {!p.safetyAnsweredAt ? (
                  <Pressable onPress={() => setFinishing(p)} accessibilityRole="button" style={styles.finish}><Text variant="caption" weight="bold" color={accent[700]}>{t('pets.finishToBook', 'Finish profile to book')}</Text></Pressable>
                ) : null}
              </View>
              <Pressable onPress={() => drop(p._id)} accessibilityRole="button" accessibilityLabel={t('common.delete', 'Delete')} hitSlop={8} style={styles.trash}><Trash2 size={16} color={slate[300]} /></Pressable>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setShowAdd(true)} accessibilityRole="button" style={styles.add}><Plus size={16} color={ink[500]} /><Text variant="bodySmall" weight="bold" color={ink[500]}>{t('pets.add', 'Add a pet')}</Text></Pressable>
      </ScrollView>
      {showAdd ? <PetProfileSheet visible onClose={() => setShowAdd(false)} /> : null}
      {toFinish ? <PetProfileSheet key={toFinish._id} pet={toFinish} visible onClose={closeFinish} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { gap: spacing.md, padding: spacing.base },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  photo: { width: 48, height: 48, borderRadius: radius.large, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: zappy[50] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  cap: { textTransform: 'capitalize' },
  finish: { alignSelf: 'flex-start', marginTop: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: accent[50] },
  trash: { padding: 6 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.base, borderRadius: radius.large, borderWidth: 2, borderStyle: 'dashed', borderColor: slate[300] },
});
