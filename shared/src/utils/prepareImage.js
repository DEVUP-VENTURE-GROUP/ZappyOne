/**
 * Make any photo a person picks uploadable and viewable everywhere.
 *
 * Phones hand over all sorts: iPhone HEIC, AVIF, BMP, screenshots with no type
 * at all, 12 MB camera originals. JPEG, PNG and WebP of a sensible size go up
 * as they are. Anything else this browser can open is redrawn as a JPEG (and
 * big photos are scaled down), so the server accepts it and every screen can
 * show it. PDFs, videos and audio are never touched.
 */
const READY = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIDE = 2400;
const KEEP_UNDER_BYTES = 4 * 1024 * 1024;

const looksLikeImage = (file) => file.type.startsWith('image/')
  || (!file.type && /\.(jpe?g|png|webp|heic|heif|avif|bmp|gif|tiff?)$/i.test(file.name || ''));

export async function prepareImage(file) {
  if (!file || !looksLikeImage(file)) return file;
  if (file.type === 'image/gif') return file; // animation would be lost
  if (READY.has(file.type) && file.size <= KEEP_UNDER_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) return file;
    const name = `${(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg`;
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    // This browser cannot open it (e.g. HEIC outside Safari): send it as it is,
    // with a type the server understands, rather than refuse the person.
    if (file.type) return file;
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const type = { heic: 'image/heic', heif: 'image/heif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext];
    return type ? new File([file], file.name, { type }) : file;
  }
}

export default prepareImage;
