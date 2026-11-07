/**
 * Photos from the phone to storage, the way the websites upload them
 * (ProofPhotos / ImageUploadField): ask the server for a signed upload URL for
 * the folder, PUT the file there, keep the returned key. The key is what the
 * job records; the file never passes through our server.
 */
import * as ImagePicker from 'expo-image-picker';
import { axiosClient } from '../api/axiosClient';
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface PickedPhoto { uri: string; mimeType: string; width?: number; height?: number }

/**
 * Take a photo with the camera (or pick from the gallery). Null if cancelled.
 * `front` opens the selfie camera, for a live photo of the person.
 */
export async function pickPhoto({ camera = true, front = false }: { camera?: boolean; front?: boolean } = {}): Promise<PickedPhoto | null> {
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(camera ? 'Allow the camera to take a photo.' : 'Allow photos to choose one.');
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'], quality: 0.7, exif: false,
    ...(camera && front ? { cameraType: ImagePicker.CameraType.front } : {}),
  };
  const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType || 'image/jpeg', width: a.width, height: a.height };
}

// Native helpers, loaded only where the build has them: an older build keeps the plain upload instead of crashing.
/* eslint-disable @typescript-eslint/no-require-imports */
const native = (() => {
  try { return { im: require('expo-image-manipulator'), fs: require('expo-file-system/legacy') }; } catch { return null; }
})();
/* eslint-enable @typescript-eslint/no-require-imports */

// Long side at most this: sharp enough to read an Aadhaar or PAN, a few hundred KB instead of several MB.
const MAX_SIDE = 1600;
const TRIES = 3;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A phone photo made small before it travels: resized and re-saved as JPEG; the original if that is not possible. */
async function shrink(photo: PickedPhoto): Promise<PickedPhoto> {
  if (!native?.im) return photo;
  try {
    const big = Math.max(photo.width || 0, photo.height || 0);
    const resize = big > MAX_SIDE ? [{ resize: (photo.width || 0) >= (photo.height || 0) ? { width: MAX_SIDE } : { height: MAX_SIDE } }] : [];
    const out = await native.im.manipulateAsync(photo.uri, resize, { compress: 0.7, format: native.im.SaveFormat.JPEG });
    return { uri: out.uri, mimeType: 'image/jpeg', width: out.width, height: out.height };
  } catch { return photo; }
}

// Builds with ZappyOne's native code (packages/native) can hand a photo to Android's WorkManager, which finishes it with the app closed.
const zappyNative = requireOptionalNativeModule<{ enqueueUpload(id: string, fileUri: string, url: string, type: string): boolean }>('ZappyNative');

// A dropped or too-weak line, as opposed to the server or storage refusing the photo (which a later try cannot fix).
const lineTrouble = (err: unknown) => {
  const e = err as { response?: unknown; message?: string } | null;
  return !e?.response && !/(d{3})/.test(String(e?.message || ''));
};

/** Upload a picked photo to `folder`; returns its storage key. Small first, streamed from the file, tried again on a weak signal, and on a phone that can, finished by Android in the background. */
export async function uploadPhoto(photo: PickedPhoto, folder: string): Promise<string> {
  const small = await shrink(photo);
  const contentType = ['image/jpeg', 'image/png', 'image/webp'].includes(small.mimeType) ? small.mimeType : 'image/jpeg';
  let last: unknown = null;
  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    try {
      // A fresh link each try: an old one may have run out while the signal was gone.
      const { data } = await axiosClient.post('/uploads/presign', { folder, contentType });
      if (native?.fs) {
        const res = await native.fs.uploadAsync(data.uploadUrl, small.uri, { httpMethod: 'PUT', uploadType: native.fs.FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': contentType } });
        if (res.status < 200 || res.status >= 300) throw new Error(`Upload failed (${res.status})`);
      } else {
        const blob = await (await fetch(small.uri)).blob();
        const put = await fetch(data.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      }
      return data.key as string;
    } catch (err) {
      last = err;
      if (attempt < TRIES) await wait(1500 * attempt);
    }
  }
  // Still no signal after the tries: Android keeps the photo and sends it when the internet is back, so the pro is not stuck on this screen.
  if (zappyNative && lineTrouble(last)) {
    try {
      const { data } = await axiosClient.post('/uploads/presign', { folder, contentType, background: true });
      if (zappyNative.enqueueUpload(String(data.key).replace(/[^A-Za-z0-9_-]/g, '_'), small.uri, data.uploadUrl, contentType)) return data.key as string;
    } catch { /* not even the small request got through: tell them below */ }
  }
  throw Object.assign(new Error('The photo did not upload. Your internet looks weak: move to a better signal and try again.'), { cause: last });
}
