/** A row of photos on a booking; a tap opens one full size. */
import { Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { webAsset } from '@zappy/ui/lib/media';
import { openLink } from '@zappy/ui/lib/openLink';
import { slate } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function PhotoStrip({ photos = [] }: { photos?: string[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {photos.map((src, i) => {
        const uri = webAsset(src) || src;
        return (
          <Pressable key={src} onPress={() => openLink(uri, 'Could not open the photo.')} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1}`} style={styles.photo}>
            <Image source={{ uri }} style={StyleSheet.absoluteFill} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  photo: { width: 88, height: 88, overflow: 'hidden', borderRadius: radius.medium, backgroundColor: slate[100] },
});
