/**
 * A document photo: asked once whether to take it now or choose one, then
 * returned for upload. Null when the person backs out. Live documents use
 * captureLive instead, which never offers the gallery.
 */
import { Alert } from 'react-native';
import { pickPhoto, type PickedPhoto } from './upload';

function chooseSource(title: string): Promise<'camera' | 'gallery' | null> {
  return new Promise((resolve) => Alert.alert(title, undefined, [
    { text: 'Take a photo', onPress: () => resolve('camera') },
    { text: 'Choose from gallery', onPress: () => resolve('gallery') },
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
  ], { cancelable: true, onDismiss: () => resolve(null) }));
}

/** Throws a message the person can act on (a refused permission). */
export async function pickDocument(): Promise<PickedPhoto | null> {
  return pickPhotoAsking('Add the document');
}

/** Any photo: take one now or choose one, asked under `title`. */
export async function pickPhotoAsking(title: string): Promise<PickedPhoto | null> {
  const source = await chooseSource(title);
  if (!source) return null;
  return pickPhoto({ camera: source === 'camera' });
}
