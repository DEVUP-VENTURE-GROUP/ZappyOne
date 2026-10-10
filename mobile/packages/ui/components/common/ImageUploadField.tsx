/**
 * One photo field: take or choose a photo, upload it, keep its key
 * (the websites' ImageUploadField).
 */
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Camera, X } from 'lucide-react-native';
import { pickPhoto, uploadPhoto } from '@zappy/core/lib/upload';
import { Button, Text } from '..';
import { ink, success } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { toast } from '../Toast';

/* One photo with a remove button (a helper's alternative item). */
export function ImageUploadField({ value, onChange, folder, label = 'photo' }: { value: string; onChange: (key: string) => void; folder: string; label?: string }) {
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function take() {
    try {
      const picked = await pickPhoto({ camera: true });
      if (!picked) return;
      setUri(picked.uri); setBusy(true);
      onChange(await uploadPhoto(picked, folder));
    } catch (e) { setUri(null); toast.error((e as Error).message || 'Could not upload the photo'); }
    finally { setBusy(false); }
  }
  return value || uri ? (
    <View style={styles.row}>
      {uri ? <Image source={{ uri }} style={styles.small} /> : null}
      <Text variant="caption" color={busy ? ink[500] : success[700]} style={styles.flex}>{busy ? 'Uploading…' : `${label} added`}</Text>
      <Pressable onPress={() => { setUri(null); onChange(''); }} hitSlop={8}><X size={16} color={ink[500]} /></Pressable>
    </View>
  ) : <Button variant="outline" size="small" icon={<Camera size={15} color={ink[900]} />} label={`Add ${label}`} onPress={take} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  small: { width: 44, height: 44, borderRadius: radius.button },
});
