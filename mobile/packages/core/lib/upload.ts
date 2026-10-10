/**
 * Photos from the phone to storage, the way the websites upload them
 * (ProofPhotos / ImageUploadField): ask the server for a signed upload URL for
 * the folder, PUT the file there, keep the returned key. The key is what the
 * job records; the file never passes through our server.
 */
import * as ImagePicker from 'expo-image-picker';
import { axiosClient } from '../api/axiosClient';

export interface PickedPhoto { uri: string; mimeType: string }

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
  return { uri: a.uri, mimeType: a.mimeType || 'image/jpeg' };
}

/** Upload a picked photo to `folder`; returns its storage key. */
export async function uploadPhoto(photo: PickedPhoto, folder: string): Promise<string> {
  const contentType = ['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimeType) ? photo.mimeType : 'image/jpeg';
  const { data } = await axiosClient.post('/uploads/presign', { folder, contentType });
  const blob = await (await fetch(photo.uri)).blob();
  const put = await fetch(data.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return data.key as string;
}
