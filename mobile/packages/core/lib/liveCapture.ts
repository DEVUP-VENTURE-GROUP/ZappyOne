/**
 * A photo that has to be taken now, never picked from the gallery (the
 * websites' LiveSelfieCapture): the camera opens directly, and the photo
 * carries when and where it was taken so a reviewer can tell it from a
 * forwarded picture. Location is required, as on the website: without a fix
 * nothing is returned and the person is told to turn location on.
 */
import { Platform } from 'react-native';
import { getBestPosition } from '../hooks/useBestPosition';
import { pickPhoto, type PickedPhoto } from './upload';

export interface LiveCaptureMeta {
  capturedAt: string;
  captureMethod: 'live_camera';
  lat: number;
  lng: number;
  accuracy: number | null;
  geoStatus: 'ok';
  userAgent: string;
}

/** Null when the person backs out of the camera. Throws a message they can act on. */
export async function captureLive({ front = true }: { front?: boolean } = {}): Promise<{ photo: PickedPhoto; meta: LiveCaptureMeta } | null> {
  // The fix is taken first: a photo without a place cannot be sent, so do not ask for one.
  let pos;
  try { pos = await getBestPosition({ windowMs: 6000 }); }
  catch { throw new Error('Turn on location to take this photo. It records where it was taken.'); }
  const photo = await pickPhoto({ camera: true, front });
  if (!photo) return null;
  return {
    photo,
    meta: {
      capturedAt: new Date().toISOString(),
      captureMethod: 'live_camera',
      lat: pos.lat,
      lng: pos.lng,
      accuracy: pos.accuracy ?? null,
      geoStatus: 'ok',
      userAgent: `ZappyOne app (${Platform.OS} ${Platform.Version})`,
    },
  };
}
