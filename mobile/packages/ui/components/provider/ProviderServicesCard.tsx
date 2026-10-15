/**
 * The services the provider works on and where each stands
 * (the websites' ProviderServicesCard).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Wrench } from 'lucide-react-native';
import { useProviderOnboardingStatusQuery } from '@zappy/core/api';
import { servicesHeadline, ENROLMENT_CHIP } from '@zappy/core/shared/workerHome';
import { Skeleton, Text } from '..';
import { RIPPLE } from '../../lib/feedback';
import { colors, ink, slate, success, accent, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

const CHIP_TONE: Record<string, { bg: string; fg: string }> = {
  none: { bg: slate[100], fg: ink[700] },
  pending: { bg: accent[50], fg: accent[700] },
  approved: { bg: success[50], fg: success[700] },
  attention: { bg: danger[50], fg: danger[600] },
};

export function ProviderServicesCard() {
  const router = useRouter();
  const { data, isLoading } = useProviderOnboardingStatusQuery();
  if (isLoading) return <Skeleton height={76} style={{ borderRadius: radius.medium }} />;
  const enrolments: { _id: string; status: string; lineCode: string; line?: { name?: string } }[] = data?.enrolments || [];
  const headline = servicesHeadline(data);
  const tone = CHIP_TONE[headline.tone];
  return (
    <Pressable onPress={() => router.push('/provider/onboarding' as never)} accessibilityRole="button"
      android_ripple={RIPPLE} style={[styles.services]}>
      <View style={[styles.iconBox, { backgroundColor: tone.bg }]}><Wrench size={17} color={tone.fg} /></View>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="bold">{headline.title}</Text>
        <Text variant="caption" color={colors.textSecondary}>{headline.body}</Text>
        {enrolments.length ? (
          <View style={styles.chips}>
            {enrolments.slice(0, 4).map((e) => {
              const chip = ENROLMENT_CHIP[e.status as keyof typeof ENROLMENT_CHIP];
              if (!chip) return null;
              const c = CHIP_TONE[chip.tone];
              return (
                <View key={e._id} style={[styles.chip, { backgroundColor: c.bg }]}>
                  <Text variant="caption" weight="bold" color={c.fg}>{e.line?.name || e.lineCode}, {chip.label}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
      <ChevronRight size={18} color={ink[400]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  iconBox: { width: 36, height: 36, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center' },
  services: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
