import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { eventPhoto } from './eventTones';

export interface Occasion { _id?: string; name: string; slug?: string; emoji?: string; coverImage?: string }

// An occasion with its photo and its name under it (the website's occasion tile); occasions without a photo are chips instead.
export const OccasionTile = memo(function OccasionTile({ occasion, onPress }: { occasion: Occasion; onPress: () => void }) {
  const photo = webAsset(eventPhoto(occasion));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={occasion.name} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.photo}>{photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}</View>
      <Text variant="body" weight="bold" numberOfLines={1}>{occasion.name}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { width: '48%', gap: 8 },
  pressed: { opacity: 0.8 },
  photo: { aspectRatio: 4 / 5, borderRadius: radius.large, overflow: 'hidden', backgroundColor: slate[100] },
});
