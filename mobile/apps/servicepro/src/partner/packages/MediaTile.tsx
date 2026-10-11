/** A photo slot on a package: the photo with a remove button, or the way to add one. */
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Camera, X } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { webAsset } from '@zappy/ui/lib/media';
import { colors, danger, ink, slate, zappy } from '@zappy/ui/theme/colors';
import { radius } from '@zappy/ui/theme/radius';
import { spacing } from '@zappy/ui/theme/spacing';

export function MediaTile({ label, required, uri, busy, onPick, onClear, size = 'wide' }: {
  label?: string; required?: boolean; uri?: string | null; busy?: boolean; onPick: () => void; onClear: () => void; size?: 'wide' | 'small';
}) {
  // A photo just taken is a local file; a saved one is a signed link or a site path.
  const shown = !uri ? null : /^(file|content|ph):/.test(uri) ? uri : webAsset(uri);
  const box = size === 'wide' ? styles.wide : styles.small;
  return (
    <View style={styles.wrap}>
      {label ? <Text variant="bodySmall" weight="semibold">{label}{required ? <Text variant="bodySmall" color={danger[500]}> *</Text> : null}</Text> : null}
      {shown ? (
        <View style={[box, styles.filled]}>
          <Image source={{ uri: shown }} style={StyleSheet.absoluteFill} />
          <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={8} style={styles.clear}><X size={14} color="#fff" /></Pressable>
        </View>
      ) : (
        <Pressable onPress={onPick} disabled={busy} accessibilityRole="button" accessibilityLabel={label || 'Add photo'} style={[box, styles.empty]}>
          {busy ? <ActivityIndicator color={zappy[600]} /> : <Camera size={20} color={ink[400]} />}
          {size === 'wide' ? <Text variant="caption" color={ink[500]}>{busy ? 'Uploading…' : 'Add a photo'}</Text> : null}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  wide: { width: '100%', height: 180, borderRadius: radius.large },
  small: { width: 84, height: 84, borderRadius: radius.medium },
  filled: { overflow: 'hidden', backgroundColor: slate[100] },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: slate[50] },
  clear: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
});
