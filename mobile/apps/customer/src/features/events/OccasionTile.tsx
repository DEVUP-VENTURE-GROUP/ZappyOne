/** An occasion to browse by (the website's occasion tile): its photo, else its colour with its emoji, the name over a dark fade. */
import { memo } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';
import { eventPhoto, eventTone } from './eventTones';

export interface Occasion { _id?: string; name: string; slug?: string; emoji?: string; coverImage?: string }

export const OccasionTile = memo(function OccasionTile({ occasion, big = false, onPress }: { occasion: Occasion; big?: boolean; onPress: () => void }) {
  const photo = webAsset(eventPhoto(occasion));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={occasion.name} style={[styles.tile, big ? styles.big : styles.small, !photo && { backgroundColor: eventTone(occasion) }]}>
      {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} /> : <Text style={styles.emoji}>{occasion.emoji || '🎉'}</Text>}
      <View style={styles.fade} />
      <Text variant={big ? 'heading3' : 'body'} weight="black" color="#fff" style={styles.name}>{occasion.name}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { overflow: 'hidden', borderRadius: radius.large, alignItems: 'center', justifyContent: 'center' },
  big: { width: '100%', height: 220 },
  small: { flexBasis: '48%', flexGrow: 1, height: 130 },
  emoji: { fontSize: 44 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', backgroundColor: 'rgba(0,0,0,0.35)' },
  name: { position: 'absolute', left: spacing.base, bottom: spacing.base, right: spacing.base },
});
