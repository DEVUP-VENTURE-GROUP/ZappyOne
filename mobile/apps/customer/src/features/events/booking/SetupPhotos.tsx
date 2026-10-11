/** The decorator's photos of the setup, the proof of what was done: the finished decor, then the room before. */
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { openLink } from '@zappy/ui/lib/openLink';
import { colors, ink, slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

type Photos = { before?: string[]; after?: string[] };
const SETS: [keyof Photos, string][] = [['after', 'Finished setup'], ['before', 'Before they started']];

export function SetupPhotos({ photos }: { photos?: Photos }) {
  if (!photos?.before?.length && !photos?.after?.length) return null;
  return (
    <View style={styles.card}>
      <Text variant="caption" weight="bold" color={ink[500]}>SETUP PHOTOS</Text>
      {SETS.map(([k, label]) => {
        const list = photos[k] || [];
        if (!list.length) return null;
        return (
          <View key={k} style={styles.set}>
            <Text variant="caption" weight="semibold" color={ink[700]}>{label}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {list.map((src) => {
                const uri = webAsset(src) || src;
                return (
                  <Pressable key={src} onPress={() => openLink(uri, 'Could not open the photo.')} accessibilityRole="imagebutton" accessibilityLabel={label} style={styles.photo}>
                    <Image source={{ uri }} style={StyleSheet.absoluteFill} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.base, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  set: { gap: spacing.sm },
  row: { gap: spacing.sm },
  photo: { width: 96, height: 96, overflow: 'hidden', borderRadius: radius.medium, backgroundColor: slate[100] },
});
