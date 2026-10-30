/**
 * Before/after photos taken on the job, uploaded as they are taken
 * (the websites' ProofPhotos).
 */
import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Camera, Check, X } from 'lucide-react-native';
import { pickPhoto, uploadPhoto } from '@zappy/core/lib/upload';
import { Button, Text } from '..';
import { zappy, ink, success, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { toast } from '../Toast';

export interface ProofPhoto { id: number; uri: string; key: string | null; uploading: boolean; error?: boolean }

export const readyKeys = (photos: ProofPhoto[] = []) => photos.filter((p) => p.key && !p.uploading && !p.error).map((p) => p.key as string);

export const photosSettled = (photos: ProofPhoto[] = []) => !photos.some((p) => p.uploading) && !photos.some((p) => p.error);

export function ProofPhotos({ photos, onChange, folder = 'order-proof', max = 3, title, hint, requiredNote = 'Minimum 1 photo required before marking complete' }: {
  photos: ProofPhoto[]; onChange: React.Dispatch<React.SetStateAction<ProofPhoto[]>>; folder?: string; max?: number; title?: string; hint?: string; requiredNote?: string;
}) {
  const ready = readyKeys(photos).length;
  const done = ready > 0;

  async function capture() {
    let picked;
    try { picked = await pickPhoto({ camera: true }); } catch (e) { toast.error((e as Error).message); return; }
    if (!picked) return;
    const id = Date.now();
    onChange((prev) => (prev.length >= max ? prev : [...prev, { id, uri: picked.uri, key: null, uploading: true }]));
    try {
      const key = await uploadPhoto(picked, folder);
      onChange((prev) => prev.map((p) => (p.id === id ? { ...p, key, uploading: false } : p)));
    } catch {
      // A failed upload stays marked, never mistaken for evidence that exists.
      onChange((prev) => prev.map((p) => (p.id === id ? { ...p, key: null, uploading: false, error: true } : p)));
      toast.error('Could not upload the photo. Check your connection and try again - if it keeps failing, contact support.');
    }
  }

  return (
    <View style={[styles.proof, done ? styles.proofDone : null]}>
      <View style={styles.row}>
        <View style={[styles.circle, { backgroundColor: done ? success[100] : zappy[50] }]}>
          {done ? <Check size={20} color={success[600]} /> : <Camera size={20} color={zappy[600]} />}
        </View>
        <View style={styles.flex}>
          <Text variant="bodySmall" weight="extrabold" color={done ? success[700] : ink[900]}>{done ? 'Proof photos ready' : (title || 'Add proof-of-work photos')}</Text>
          <Text variant="caption" color={done ? success[600] : ink[500]}>{done ? `${ready} photo${ready > 1 ? 's' : ''} uploaded - you can add ${max - photos.length} more` : (hint || requiredNote)}</Text>
        </View>
        <View style={[styles.counter, { backgroundColor: done ? success[600] : zappy[100] }]}><Text variant="caption" weight="extrabold" color={done ? '#fff' : zappy[700]}>{ready}/{max}</Text></View>
      </View>
      {photos.length ? (
        <View style={styles.grid}>
          {photos.map((p) => (
            <View key={p.id} style={styles.thumbWrap}>
              <Image source={{ uri: p.uri }} style={[styles.thumb, { borderColor: p.error ? danger[400] : p.uploading ? zappy[300] : success[500] }]} accessibilityLabel="Proof photo" />
              {p.uploading ? <View style={styles.thumbVeil}><Text variant="caption" weight="bold" color="#fff">Uploading…</Text></View> : (
                <Pressable onPress={() => onChange((prev) => prev.filter((x) => x.id !== p.id))} accessibilityLabel="Remove photo" style={styles.thumbRemove} hitSlop={6}>
                  <X size={10} color="#fff" />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}
      {photos.length < max ? (
        <Button variant="outline" icon={<Camera size={17} color={ink[900]} />} label={photos.length === 0 ? 'Take proof photo' : 'Add another photo'} onPress={capture} fullWidth />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  proof: { backgroundColor: zappy[50], borderRadius: radius.medium, borderWidth: 1, borderColor: zappy[100], padding: spacing.base, gap: spacing.md },
  proofDone: { backgroundColor: success[50], borderColor: success[100] },
  counter: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  grid: { flexDirection: 'row', gap: spacing.sm },
  thumbWrap: { width: '31%', aspectRatio: 1 },
  thumb: { width: '100%', height: '100%', borderRadius: radius.medium, borderWidth: 2 },
  thumbVeil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.medium, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  thumbRemove: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
});
