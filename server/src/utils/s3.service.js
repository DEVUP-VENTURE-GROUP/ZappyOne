const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuid } = require('uuid');
const config = require('../config');

const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
  // AWS SDK v3 (>= 3.729) embeds a CRC32 checksum into presigned PUT URLs by
  // default. That breaks direct browser uploads — the browser must then send an
  // x-amz-checksum-crc32 header matching a checksum computed at sign time, which
  // it can't. Reverting to WHEN_REQUIRED keeps presigned PUTs simple (just
  // Content-Type), so the client can upload with no extra headers.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

/**
 * Generates a presigned PUT URL — client uploads directly to S3, never streams through our API.
 * This is how you scale file uploads; never proxy binary data through Node.
 */
async function getUploadUrl({ folder, contentType, userId }) {
  const key = `${folder}/${userId}/${uuid()}`;
  const cmd = new PutObjectCommand({
    Bucket: config.aws.bucket,
    Key: key,
    ContentType: contentType,
  });
  try {
    const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
    return { uploadUrl: url, key };
  } catch (err) {
    // S3/network down — surface a clear message instead of a 500
    throw Object.assign(
      new Error('File upload service is temporarily unavailable. Please try again in a moment.'),
      { status: 503, code: 'S3_UNAVAILABLE', cause: err.message }
    );
  }
}

async function getViewUrl(key, expiresIn = 86400) {
  const cmd = new GetObjectCommand({ Bucket: config.aws.bucket, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

/**
 * Turn a stored reference into something a browser can actually load.
 *
 * The bucket is private, so handing a raw S3 key to an `<img src>` renders
 * nothing — and "nothing" looks exactly like "no photo was uploaded", which is
 * why this kept being reported as photos not saving. They saved fine; they were
 * never signed on the way out.
 *
 * Already-absolute URLs pass through untouched, so a mix of legacy URLs and new
 * keys in the same array is safe. Failure returns null rather than throwing: one
 * unsignable photo must never take down the screen it appears on.
 */
async function signMedia(ref) {
  if (!ref) return null;
  if (String(ref).startsWith('http')) return ref;
  try { return await getViewUrl(ref); } catch { return null; }
}

/** The same, for a list. Unsignable entries are dropped, not left broken. */
async function signMediaList(refs = []) {
  if (!Array.isArray(refs) || !refs.length) return [];
  const signed = await Promise.all(refs.map(signMedia));
  return signed.filter(Boolean);
}

/**
 * Every field across the catalog that holds a media reference.
 *
 * Listed once, because the alternative was remembering to sign each one at each
 * of the dozens of places it is read — and that is precisely what did not
 * happen: brands, models, categories and problems all stored their uploads
 * correctly and served raw S3 keys to `<img src>`, which loads nothing. An
 * admin uploaded a logo, saw the local preview, refreshed, and watched it
 * "disappear". It had never gone anywhere; it was never signed.
 */
const MEDIA_FIELDS = [
  'logoUrl', 'imageUrl', 'iconUrl', 'videoUrl', 'coverImageUrl', 'coverImage',
  'photoUrl', 'thumbUrl', 'avatar', 'profilePhotoKey',
];

/** Array-valued media fields, signed member by member. */
const MEDIA_LIST_FIELDS = [
  'galleryImages', 'completionPhotos', 'evidenceUrls', 'images', 'portfolioImages',
];

/**
 * Sign every media field on a plain document, in place-ish.
 *
 * Returns a NEW object so a `.lean()` result can be handed straight to
 * `res.json`. Unknown fields are untouched, absent fields stay absent, and an
 * already-absolute URL passes through — so a collection holding a mix of legacy
 * URLs and new keys is safe.
 */
async function signDocMedia(doc) {
  if (!doc || typeof doc !== 'object') return doc;

  const out = { ...doc };
  await Promise.all([
    ...MEDIA_FIELDS
      .filter((f) => out[f])
      .map(async (f) => { out[f] = (await signMedia(out[f])) || ''; }),
    ...MEDIA_LIST_FIELDS
      .filter((f) => Array.isArray(out[f]) && out[f].length)
      .map(async (f) => { out[f] = await signMediaList(out[f]); }),
  ]);
  return out;
}

/**
 * Reduce a media value back to the clean key we should STORE.
 *
 * Reads now hand the client a signed URL, and an inline-edit form sends that
 * same value straight back on the next save — so without this, re-editing a row
 * persists a signed URL that expires in a day and then 404s. We only ever store
 * the bucket-relative key; the signature is minted fresh on every read.
 *
 * A key is returned unchanged, an empty value stays empty, and a genuinely
 * external URL (not our bucket) is left alone so a pasted CDN link still works.
 */
function keyFromMedia(value) {
  if (!value || typeof value !== 'string') return value;
  if (!/^https?:\/\//.test(value)) return value; // already a key

  const bucket = config.aws?.bucket;
  try {
    const u = new URL(value);
    const host = u.hostname;
    // Our bucket, virtual-hosted or path-style. Anything else is external.
    const isOurs = bucket && (host.startsWith(`${bucket}.`) || u.pathname.startsWith(`/${bucket}/`));
    if (!isOurs) return value;
    let key = u.pathname.replace(/^\//, '');
    if (bucket && key.startsWith(`${bucket}/`)) key = key.slice(bucket.length + 1);
    return decodeURIComponent(key);
  } catch { return value; }
}

/** Normalise every media field on a document to its clean key, in place-ish. */
function normalizeDocMedia(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = { ...doc };
  for (const f of MEDIA_FIELDS) if (f in out) out[f] = keyFromMedia(out[f]);
  for (const f of MEDIA_LIST_FIELDS) {
    if (Array.isArray(out[f])) out[f] = out[f].map(keyFromMedia);
  }
  return out;
}

/** The same, for a list of documents. */
async function signDocsMedia(docs) {
  if (!Array.isArray(docs)) return docs;
  return Promise.all(docs.map(signDocMedia));
}

async function getDownloadUrl(key, expiresIn = 300) {
  const filename = key.split('/').pop();
  const cmd = new GetObjectCommand({
    Bucket: config.aws.bucket,
    Key:    key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
    ResponseContentType:        'application/octet-stream',
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

/**
 * Streams an S3 object directly to an HTTP response.
 * Used for admin KYC document viewing — no presigned URL, no expiry.
 * The document stays accessible as long as it exists in S3 (forever).
 * Bucket stays fully private; our server is the authenticated gateway.
 */
async function streamToResponse(key, res) {
  const cmd = new GetObjectCommand({ Bucket: config.aws.bucket, Key: key });
  const obj = await s3.send(cmd);

  // KYC/doc keys are UUIDs with no extension, so extension sniffing fails.
  // Prefer the Content-Type stored on the object at upload time (set via the
  // presigned PUT), fall back to extension, then jpeg.
  const ext = key.split('.').pop()?.toLowerCase();
  const extType = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[ext];
  const contentType = obj.ContentType || extType || 'image/jpeg';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, max-age=86400'); // browser caches for 24h — admin session
  if (obj.ContentLength) res.setHeader('Content-Length', obj.ContentLength);

  // AWS SDK v3 returns a Node Readable — pipe it, and tear down cleanly on error
  // so a mid-stream S3 failure doesn't leave the response hanging.
  obj.Body.on('error', () => { res.destroy(); });
  obj.Body.pipe(res);
}

async function deleteObject(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: config.aws.bucket, Key: key }));
}

module.exports = {
  getUploadUrl, getViewUrl, getDownloadUrl,
  signMedia, signMediaList, signDocMedia, signDocsMedia,
  keyFromMedia, normalizeDocMedia,
  MEDIA_FIELDS, MEDIA_LIST_FIELDS,
  streamToResponse, deleteObject,
};
