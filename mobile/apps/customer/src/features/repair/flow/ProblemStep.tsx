/**
 * What is wrong (the website's ProblemStep): the symptoms for this model,
 * narrowed by its type and fuel, under their headings. A symptom picked on Home
 * is chosen here once the list confirms this model has it, so a stale link
 * cannot smuggle in a symptom the model does not have.
 */
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useRepairProblemsQuery } from '@zappy/core/api';
import { categoryPhoto } from '@zappy/core/shared/problemArt';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { ink } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { ProblemLayout, type Problem } from '../ProblemCard';
import type { Coded } from './BrandStep';
import { Shell, Spinner, flow } from './FlowChrome';
import type { Model } from './ModelStep';

interface Category { code: string; name: string; imageUrl?: string; problems: Problem[] }

export function ProblemStep({ vertical, model, productType, fuelType, presetCode, onPick, pin }: {
  pin?: { lat?: number; lng?: number } | null;
  vertical: string; model: Model; productType: Coded | null; fuelType: string | null; presetCode: string | null; onPick: (p: Problem) => void;
}) {
  // The model's own type is preferred over the step's: the catalog knows better than the tap did.
  const { data, isLoading } = useRepairProblemsQuery({ vertical, modelCode: model.code, productTypeCode: model.productTypeCode || productType?.code, fuelType: fuelType || undefined, ...(typeof pin?.lat === 'number' && typeof pin?.lng === 'number' && { lat: Math.round(pin.lat * 1000) / 1000, lng: Math.round(pin.lng * 1000) / 1000 }) });
  const categories: Category[] = data?.categories || [];

  useEffect(() => {
    if (!presetCode || isLoading) return;
    const match = categories.flatMap((c) => c.problems).find((p) => p.code === presetCode);
    if (match) onPick(match);
  }, [presetCode, isLoading, categories, onPick]);

  if (isLoading) return <Spinner />;
  return (
    <Shell>
      <Text variant="caption" color={ink[500]} style={flow.label}>Tell us what you're seeing. We'll work out the repair; we never assume it from the symptom alone.</Text>
      {categories.map((cat) => {
        const cover = webAsset(categoryPhoto(vertical, cat));
        return (
          <View key={cat.code} style={styles.section}>
            <View style={styles.head}>
              {cover ? <Image source={{ uri: cover }} style={styles.cover} /> : null}
              <Text variant="body" weight="bold">{cat.name}</Text>
              <Text variant="caption" color={ink[500]}>{cat.problems.length}</Text>
            </View>
            <ProblemLayout vertical={vertical} problems={cat.problems} category={cat} onPick={onPick} />
          </View>
        );
      })}
    </Shell>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, paddingTop: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 4 },
  cover: { width: 32, height: 32, borderRadius: radius.button },
});
