/**
 * The account's photo with a camera button to change it. One component for
 * every app, saving to the same place, so the photo is always the same one.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Camera, UserRound } from 'lucide-react-native';
import { useSetAccountPhotoMutation } from '@zappy/core/api';
import { pickPhoto, uploadPhoto } from '@zappy/core/lib/upload';
import { Text } from '..';
import { errText } from '../../lib/feedback';
import { colors, zappy, ink, slate } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { toast } from '../Toast';

const FOLDER: Record<string, string> = { shop: 'shop', event_partner: 'event-photos' };

export function ProfilePhoto({ url, role = 'user', size = 88, label = 'Your photo', onSaved }: {
  url?: string | null; role?: string; size?: number; label?: string; onSaved?: (st: unknown) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [save, { isLoading: saving }] = useSetAccountPhotoMutation();
  const busy = uploading || saving;

  async function pick() {
    let photo;
    // A refused permission says how to allow it; that message is for the person.
    try { photo = await pickPhoto({ camera: false }); } catch (err) { toast.error((err as Error).message); return; }
    if (!photo) return;
    try {
      setPreview(photo.uri);
      setUploading(true);
      const key = await uploadPhoto(photo, FOLDER[role] || 'profile');
      const st = await save(key).unwrap();
      toast.success('Photo saved');
      onSaved?.(st);
    } catch (err) {
      setPreview(null);
      toast.error(errText(err, 'The photo did not upload. Check your connection and try again.'));
    } finally { setUploading(false); }
  }

  const shown = preview || url;
  return (
    <View style={styles.centerCol}>
      <Pressable onPress={pick} disabled={busy} accessibilityRole="button" accessibilityLabel={shown ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`} style={{ width: size, height: size }}>
        <View style={[styles.photo, { width: size, height: size, borderRadius: size / 2 }]}>
          {shown ? <Image source={{ uri: shown }} style={{ width: size, height: size }} /> : <UserRound size={size * 0.42} color={ink[400]} />}
        </View>
        <View style={styles.camBadge}>{busy ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={14} color="#fff" />}</View>
      </Pressable>
      <Text variant="caption" weight="semibold" color={zappy[600]}>{shown ? 'Change photo' : 'Add a photo'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerCol: { alignItems: 'center', gap: spacing.sm },
  photo: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: slate[100], borderWidth: 1, borderColor: colors.border },
  camBadge: { position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#fff', backgroundColor: zappy[600], alignItems: 'center', justifyContent: 'center' },
});
