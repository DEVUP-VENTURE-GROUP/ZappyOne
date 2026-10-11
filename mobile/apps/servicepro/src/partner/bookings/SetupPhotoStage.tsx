/**
 * One set of setup photos (before, or the finished setup): what is in, and a
 * camera button while that set is open. Up to 10 each; the customer sees them.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera } from 'lucide-react-native';
import { useAddPartnerSetupPhotosMutation } from '@zappy/core/api';
import { pickPhoto, uploadPhoto } from '@zappy/core/lib/upload';
import { Button, Text } from '@zappy/ui/components';
import { toast } from '@zappy/ui/components/Toast';
import { errText } from '@zappy/ui/lib/feedback';
import { ink, zappy } from '@zappy/ui/theme/colors';
import { spacing } from '@zappy/ui/theme/spacing';
import { PhotoStrip } from './PhotoStrip';

const MAX = 10;

export function SetupPhotoStage({ id, stage, title, photos = [], enabled, lockedText = 'Not yet.' }: {
  id: string; stage: 'before' | 'after'; title: string; photos?: string[]; enabled: boolean; lockedText?: string;
}) {
  const [save] = useAddPartnerSetupPhotosMutation();
  const [busy, setBusy] = useState(false);

  async function add() {
    let photo;
    try { photo = await pickPhoto({ camera: true }); } catch (err) { toast.error((err as Error).message); return; }
    if (!photo) return;
    setBusy(true);
    try {
      const key = await uploadPhoto(photo, 'event-photos');
      await save({ id, stage, keys: [key] }).unwrap();
      toast.success('Photo added');
    } catch (err) { toast.error(errText(err, 'Could not add the photo. Try again.')); }
    finally { setBusy(false); }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text variant="bodySmall" weight="bold">{title} <Text variant="caption" color={ink[400]}>({photos.length})</Text></Text>
        {enabled && photos.length < MAX ? <Button label="Add photo" size="small" variant="outline" loading={busy} icon={<Camera size={14} color={zappy[600]} />} onPress={add} /> : null}
      </View>
      {photos.length ? <PhotoStrip photos={photos} /> : <Text variant="caption" color={ink[500]}>{enabled ? 'No photos yet.' : lockedText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
