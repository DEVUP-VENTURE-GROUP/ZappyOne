// Downscale + recompress an image before upload so ZappyLens scans are fast and
// cheap (vision token cost scales with resolution; ~1024px is plenty to tell a
// cracked screen from a flat tyre). Returns a JPEG Blob.
export async function downscaleImage(fileOrBlob, maxDim = 1024, quality = 0.85) {
  const bitmap = await createImageBitmap(fileOrBlob);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
  return blob || fileOrBlob;
}
