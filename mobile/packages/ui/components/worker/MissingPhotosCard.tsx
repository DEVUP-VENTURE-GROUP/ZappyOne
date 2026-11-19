// Jobs on the pro's menu with no photo: one tap to the menu to add them (the websites' MissingPhotosCard).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, ChevronRight } from 'lucide-react-native';
import { useProviderMissingPhotosQuery } from '@zappy/core/api';
import { Text } from '..';
import { accent, ink, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export function MissingPhotosCard({ to = '/provider/services' }: { to?: string }) {
  const router = useRouter();
  const { data } = useProviderMissingPhotosQuery(undefined);
  if (!data?.count) return null;
  const names = (data.names as string[]).join(', ') + (data.count > data.names.length ? ` and ${data.count - data.names.length} more` : '');
  return (
    <Pressable onPress={() => router.push(to as never)} accessibilityRole="button" style={styles.card}>
      <View style={styles.icon}><Camera size={17} color={accent[700]} /></View>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="semibold">{data.count === 1 ? '1 job has no photo' : `${data.count} jobs have no photo`}</Text>
        <Text variant="caption" color={ink[500]} numberOfLines={2}>Customers book what they can see. Add a photo to {names}.</Text>
      </View>
      <ChevronRight size={18} color={slate[400]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.large, borderWidth: 1, borderColor: accent[100], backgroundColor: accent[50] },
  icon: { width: 36, height: 36, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center', backgroundColor: accent[100] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
});
