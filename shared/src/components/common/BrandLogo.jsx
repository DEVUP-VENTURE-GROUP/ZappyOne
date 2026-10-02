import { useEffect, useState } from 'react';

/**
 * A brand's mark, sized to be read.
 *
 * Uploaded logos usually arrive as wide canvases with the wordmark small in
 * the middle; shrunk to a tile they read as a blank. We crop each one to its
 * visible mark once (per image, per session) and draw that. If the crop is not
 * possible (the image cannot be read back), the image is shown as it is; with
 * no logo, or one that fails to load, the brand's initial stands in.
 */
const cropped = new Map(); // image path -> data URL, or null when it cannot be cropped

const keyOf = (url) => String(url).split('?')[0];

function cropToMark(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    // A failed cross-origin load is usually CORS, not a missing file: show the
    // image uncropped and let the <img> itself decide if it is broken.
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const px = ctx.getImageData(0, 0, w, h).data;

        // Ink is anything clearly away from white that is not see-through;
        // soft shadows and faint card edges in the upload stay outside.
        const ink = (i) => px[i + 3] > 40 && 255 - Math.min(px[i], px[i + 1], px[i + 2]) > 60;
        let top = h; let bottom = -1; let left = w; let right = -1;
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if (ink((y * w + x) * 4)) {
              if (y < top) top = y;
              if (y > bottom) bottom = y;
              if (x < left) left = x;
              if (x > right) right = x;
            }
          }
        }
        if (bottom < 0) { resolve(null); return; }

        const pad = Math.round(Math.max(right - left, bottom - top) * 0.04);
        const sx = Math.max(0, left - pad); const sy = Math.max(0, top - pad);
        const sw = Math.min(w, right + pad + 1) - sx; const sh = Math.min(h, bottom + pad + 1) - sy;
        const out = document.createElement('canvas');
        out.width = sw; out.height = sh;
        out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(out.toDataURL('image/png'));
      } catch {
        resolve(null); // read-back blocked: show the image uncropped
      }
    };
    img.src = url;
  });
}

export default function BrandLogo({ name = '', url, className = 'h-8 w-20', active = false }) {
  const key = url ? keyOf(url) : null;
  const [src, setSrc] = useState(() => (key && cropped.get(key)) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!key) return undefined;
    if (cropped.has(key)) { setSrc(cropped.get(key) || url); return undefined; }
    let live = true;
    cropToMark(url).then((data) => {
      cropped.set(key, data);
      if (live) setSrc(data || url);
    });
    return () => { live = false; };
  }, [key, url]);

  if (!url || failed) {
    return (
      <span aria-hidden="true"
        className={`flex h-10 w-10 items-center justify-center rounded-btn text-[17px] font-bold ${
          active ? 'bg-zappy-600 text-white' : 'bg-sunken text-ink-700'}`}>
        {name.trim()[0]?.toUpperCase() || '?'}
      </span>
    );
  }
  if (!src) return <span aria-hidden="true" className={`block ${className}`} />;
  return <img src={src} alt="" className={`${className} object-contain`} onError={() => setFailed(true)} />;
}
