/** A picture for a service or a kind of work: its upload, our photo, else its character. */
import { Image, StyleSheet } from 'react-native';
import { servicePhoto } from '@zappy/core/shared/problemArt';
import { artFor } from '@zappy/core/shared/serviceArt';
import { webAsset } from '../../../lib/media';
import { slate } from '../../../theme/colors';
import { radius } from '../../../theme/radius';

export const pictureOf = (code: string | null, domainCode: string, imageUrl?: string | null): string | null =>
  webAsset(imageUrl || (code && servicePhoto(code)) || artFor(code, domainCode)?.still || null);

export function ServiceThumb({ src }: { src: string | null }) {
  return src ? <Image source={{ uri: src }} style={styles.thumb} accessibilityIgnoresInvertColors /> : null;
}

const styles = StyleSheet.create({
  thumb: { width: 56, height: 56, borderRadius: radius.medium, backgroundColor: slate[50] },
});
