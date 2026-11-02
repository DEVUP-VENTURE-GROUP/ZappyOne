import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { pickPhoto, uploadPhoto } from '@zappy/core/lib/upload';
import { Text } from '..';
import { colors, ink, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { toast } from '../Toast';

type Setter = (next: string[] | ((cur: string[]) => string[])) => void;

// Square photo tiles with gallery and camera buttons (the websites' PhotoTiles); `value` is stored keys, `previews` maps key to a signed URL, `onChange` is a useState setter.
export function PhotoTiles({ value = [], onChange, previews = {}, max = 6, folder = 'menu', size = 72 }: {
  value?: string[]; onChange: Setter; previews?: Record<string, string>; max?: number; folder?: string; size?: number;
}) {
  const [local, setLocal] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const box = { width: size, height: size };

  async function add(camera: boolean) {
    try {
      const picked = await pickPhoto({ camera });
      if (!picked) return;
      setBusy(true);
      const key = await uploadPhoto(picked, folder);
      setLocal((m) => ({ ...m, [key]: picked.uri }));
      onChange((cur) => [...cur, key].slice(0, max));
    } catch (e) { toast.error((e as Error).message || 'That photo did not upload. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <View style={styles.row}>
      {value.map((key) => (
        <View key={key} style={[styles.tile, box]}>
          {local[key] || previews[key] ? <Image source={{ uri: local[key] || previews[key] }} style={StyleSheet.absoluteFill} /> : null}
          <Pressable onPress={() => onChange((cur) => cur.filter((k) => k !== key))} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={6} style={styles.remove}>
            <X size={12} color="#fff" />
          </Pressable>
        </View>
      ))}
      {busy ? <View style={[styles.tile, box, styles.center]}><ActivityIndicator color={ink[400]} /></View> : null}
      {!busy && value.length < max ? (
        <>
          <Pressable onPress={() => add(false)} accessibilityRole="button" accessibilityLabel="Add a photo from the gallery" style={[styles.add, box]}>
            <ImagePlus size={18} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[500]}>Gallery</Text>
          </Pressable>
          <Pressable onPress={() => add(true)} accessibilityRole="button" accessibilityLabel="Take a photo" style={[styles.add, box]}>
            <Camera size={18} color={ink[500]} /><Text variant="caption" weight="semibold" color={ink[500]}>Camera</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { borderRadius: radius.button, overflow: 'hidden', backgroundColor: slate[100] },
  center: { alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,24,40,0.7)' },
  add: { borderRadius: radius.button, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: colors.surface },
});
