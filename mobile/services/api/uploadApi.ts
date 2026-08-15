/**
 * Presigned S3 upload — `POST /uploads/presign` mirrors client/src (same
 * backend). The server hands back a short-lived signed PUT URL + the object
 * key; the client PUTs the file bytes directly to S3, then submits the KEY
 * (not the URL — kyc.controller streams it back privately, permanently) as
 * e.g. `aadhaarUrl` on `/workers/kyc/submit`.
 */

import { apiSlice } from './apiSlice';
import { createLogger } from '../../lib/logger';

const log = createLogger('upload');

export type UploadFolder =
  | 'kyc' | 'profile' | 'order-proof' | 'vehicle-health'
  | 'completion-photos' | 'order-images' | 'event-photos';

interface PresignResponse {
  uploadUrl: string;
  key: string;
}

export const uploadApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    presignUpload: builder.mutation<PresignResponse, { folder: UploadFolder; contentType: string; filename?: string }>({
      query: (data) => ({ url: '/uploads/presign', method: 'POST', data }),
    }),
  }),
});

export const { usePresignUploadMutation } = uploadApi;

/**
 * Upload a local file (from expo-image-picker / expo-camera) to a presigned
 * S3 URL. No expo-file-system dependency — `fetch(localUri)` on a `file://`
 * URI resolves to a Blob directly in Expo/React Native.
 */
export async function uploadToPresignedUrl(localUri: string, uploadUrl: string, contentType: string): Promise<void> {
  const fileResponse = await fetch(localUri);
  const blob = await fileResponse.blob();
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putResponse.ok) {
    log.error('S3 PUT failed', { status: putResponse.status });
    throw new Error('Upload failed — please try again.');
  }
}
