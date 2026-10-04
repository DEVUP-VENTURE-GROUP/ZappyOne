/**
 * Upload one file straight to storage and return its key.
 *
 * `presign` is the RTK mutation trigger from usePresignUploadMutation. The key
 * is what gets saved on a record; a signed URL for viewing is minted on read.
 */
export async function uploadFile(presign, file, { folder = 'event-photos', maxMb = 10 } = {}) {
  if (!file) throw new Error('No file chosen');
  if (file.size > maxMb * 1024 * 1024) throw new Error(`That file is over ${maxMb}MB. Pick a smaller one.`);
  const contentType = file.type || 'image/jpeg';
  const signed = await presign({ contentType, folder, filename: file.name }).unwrap();
  const put = await fetch(signed.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } });
  if (!put.ok) throw new Error('Upload failed. Check your connection and try again.');
  return signed.key;
}
