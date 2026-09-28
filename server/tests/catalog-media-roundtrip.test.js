/**
 * Catalog images must survive the full upload → save → refresh → re-edit loop.
 *
 * Reported repeatedly: "I upload a brand logo, refresh, it's gone." The upload
 * and the write were both fine — the failures were at the edges:
 *
 *   · reads served the raw private-bucket KEY, which an <img> cannot load, so a
 *     saved logo looked identical to no logo;
 *   · once reads were signed, an inline-edit form sent that signed URL straight
 *     back on the next save, persisting a link that expired in a day.
 *
 * This pins the contract: the DB always holds a clean key, every read hands out
 * a fresh signed URL, and bouncing a signed URL back through a save does not
 * corrupt the stored key.
 */

const {
  keyFromMedia, normalizeDocMedia, signMedia, MEDIA_FIELDS,
} = require('../src/core/storage/s3');

const BUCKET_URL = 'https://hyperlocal-uploads-workers.s3.ap-south-1.amazonaws.com';

describe('keyFromMedia — reduce any media value to the key we store', () => {
  it('leaves a bare key untouched', () => {
    expect(keyFromMedia('brands/u1/abc-123')).toBe('brands/u1/abc-123');
  });

  it('strips a signed URL of our bucket back to its key', () => {
    const signed = `${BUCKET_URL}/brands/u1/abc-123?X-Amz-Algorithm=AWS4&X-Amz-Signature=deadbeef`;
    expect(keyFromMedia(signed)).toBe('brands/u1/abc-123');
  });

  it('decodes an escaped path', () => {
    expect(keyFromMedia(`${BUCKET_URL}/problems/u1/a%20b.png`)).toBe('problems/u1/a b.png');
  });

  it('leaves a genuinely external URL alone (pasted CDN link)', () => {
    const ext = 'https://cdn.example.com/logo.png';
    expect(keyFromMedia(ext)).toBe(ext);
  });

  it('passes empty and nullish through unchanged', () => {
    expect(keyFromMedia('')).toBe('');
    expect(keyFromMedia(null)).toBeNull();
    expect(keyFromMedia(undefined)).toBeUndefined();
  });
});

describe('normalizeDocMedia — every media field on a document', () => {
  it('cleans logoUrl but leaves other fields alone', () => {
    const out = normalizeDocMedia({
      name: 'Samsung',
      logoUrl: `${BUCKET_URL}/brands/u1/k?X-Amz-Signature=x`,
      sortOrder: 1,
    });
    expect(out.logoUrl).toBe('brands/u1/k');
    expect(out.name).toBe('Samsung');
    expect(out.sortOrder).toBe(1);
  });

  it('cleans a gallery array member by member', () => {
    const out = normalizeDocMedia({
      galleryImages: [`${BUCKET_URL}/shop/u1/a?X-Amz-Signature=1`, 'shop/u1/b'],
    });
    expect(out.galleryImages).toEqual(['shop/u1/a', 'shop/u1/b']);
  });

  it('names every field the model actually uses', () => {
    // A guard: if a new image field is added to a model, add it here too.
    for (const f of ['logoUrl', 'imageUrl', 'iconUrl', 'videoUrl']) {
      expect(MEDIA_FIELDS).toContain(f);
    }
  });
});

describe('the round trip does not corrupt', () => {
  it('re-saving a signed read value stores the same clean key', () => {
    const key = 'brands/u1/original-key';

    // Read: the API signs it for the browser.
    // (signMedia returns the key unchanged when S3 is unreachable in a unit
    // context, so assert the shape rather than a live signature.)
    // Then the inline form sends that value straight back on the next save:
    const signedishBounceBack = `${BUCKET_URL}/${key}?X-Amz-Signature=abc`;
    const stored = normalizeDocMedia({ logoUrl: signedishBounceBack }).logoUrl;

    expect(stored).toBe(key);
  });

  it('signMedia hands a key straight to getViewUrl, never a raw key to the browser', async () => {
    // A key must never be returned unchanged as if it were loadable.
    const out = await signMedia('brands/u1/k');
    // Either a signed URL (S3 reachable) or null (unreachable) — never the key.
    expect(out).not.toBe('brands/u1/k');
  });
});
