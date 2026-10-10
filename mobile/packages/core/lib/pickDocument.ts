/**
 * A document photo: asked once whether to take it now or choose one, then
 * returned for upload. Null when the person backs out. Live documents use
 * captureLive instead, which never offers the gallery.
 */
import { Alert } from 'react-native';
import { pickPhoto, type PickedPhoto } from './upload';

function chooseSource(): Promise<'camera' | 'gallery' | null> {
  return new Promise((resolve) => Alert.alert('Add the document', undefined, [
    { text: 'Take a photo', onPress: () => resolve('camera') },
    { text: 'Choose from gallery', onPress: () => resolve('gallery') },
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
  ], { cancelable: true, onDismiss: () => resolve(null) }));
}

/** Throws a message the person can act on (a refused permission). */
export async function pickDocument(): Promise<PickedPhoto | null> {
  const source = await chooseSource();
  if (!source) return null;
  return pickPhoto({ camera: source === 'camera' });
}
