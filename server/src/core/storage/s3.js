const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuid } = require('uuid');
const config = require('../../config');

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
  // A signed link of ours saved by mistake has long expired: sign its key afresh.
  ref = keyFromMedia(ref);
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

/* Homepage banner artwork */

/**
 * Banner artwork lives under its own prefix, apart from customer, provider and
 * catalog uploads, with keys the server mints: homepage-banners/YYYY/MM/<uuid>.<ext>.
 * The client never names a key, so nothing it sends can point a banner at
 * another file in the bucket.
 */
const BANNER_PREFIX = 'homepage-banners/';
const BANNER_TYPES = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] };
const BANNER_MAX_BYTES = 5 * 1024 * 1024;
const BANNER_UPLOAD_TTL_SEC = 300;       // the upload link is good for 5 minutes
const BANNER_READ_TTL_SEC = 6 * 60 * 60; // a served image link is good for 6 hours
const BANNER_KEY_RE = /^homepage-banners\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const isBannerKey = (key) => typeof key === 'string' && BANNER_KEY_RE.test(key);

/**
 * A presigned PUT for one banner image. Content-Type AND Content-Length are
 * signed, so S3 itself refuses a different type or a different size than the
 * one validated here. Callers validate type, extension and size first; this
 * re-checks so it is safe on its own.
 */
async function getBannerUploadUrl({ contentType, size }) {
  const exts = BANNER_TYPES[contentType];
  if (!exts) throw Object.assign(new Error('Use a JPG, PNG or WebP image.'), { status: 400, code: 'BANNER_TYPE' });
  if (!Number.isInteger(size) || size < 1 || size > BANNER_MAX_BYTES) {
    throw Object.assign(new Error('The image must be 5 MB or smaller.'), { status: 400, code: 'BANNER_SIZE' });
  }
  const now = new Date();
  const key = `${BANNER_PREFIX}${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${uuid()}.${exts[0]}`;
  const cmd = new PutObjectCommand({ Bucket: config.aws.bucket, Key: key, ContentType: contentType, ContentLength: size });
  try {
    const uploadUrl = await getSignedUrl(s3, cmd, {
      expiresIn: BANNER_UPLOAD_TTL_SEC,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return { uploadUrl, key, expiresIn: BANNER_UPLOAD_TTL_SEC, headers: { 'Content-Type': contentType } };
  } catch (err) {
    throw Object.assign(
      new Error('File upload service is temporarily unavailable. Please try again in a moment.'),
      { status: 503, code: 'S3_UNAVAILABLE', cause: err.message },
    );
  }
}

/**
 * What a banner's stored image becomes on the way out.
 *   banner key        → a signed read link (6 h)
 *   our signed link   → its key, signed afresh (a stale link saved by mistake)
 *   external https    → unchanged (links pasted before uploads existed)
 *   anything else     → '' — never sign a key outside the banner prefix, so a
 *                        banner can't be used to read another stored file.
 */
async function signBannerImage(ref) {
  if (!ref || typeof ref !== 'string') return '';
  const value = keyFromMedia(ref);
  if (/^https:\/\//i.test(value)) return value;
  if (!isBannerKey(value)) return '';
  try { return await getViewUrl(value, BANNER_READ_TTL_SEC); } catch { return ''; }
}

/**
 * What may be STORED as a banner image: '', a banner key, or an external https
 * link. A signed link of ours is reduced to its key, so a temporary URL is
 * never saved. Returns the value to store, or throws 400.
 */
function normalizeBannerImage(ref) {
  if (ref == null || ref === '') return '';
  if (typeof ref !== 'string') throw Object.assign(new Error('Invalid banner image'), { status: 400, code: 'BANNER_IMAGE_INVALID' });
  const value = keyFromMedia(ref.trim());
  if (isBannerKey(value)) return value;
  if (/^https:\/\//i.test(value)) {
    try { new URL(value); return value; } catch { /* fall through */ }
  }
  throw Object.assign(
    new Error('Banner images must be uploaded here, or be a public https:// link.'),
    { status: 400, code: 'BANNER_IMAGE_INVALID' },
  );
}

module.exports = {
  getBannerUploadUrl, signBannerImage, normalizeBannerImage, isBannerKey,
  BANNER_PREFIX, BANNER_TYPES, BANNER_MAX_BYTES, BANNER_UPLOAD_TTL_SEC, BANNER_READ_TTL_SEC,
  getUploadUrl, getViewUrl, getDownloadUrl,
  signMedia, signMediaList, signDocMedia, signDocsMedia,
  keyFromMedia, normalizeDocMedia,
  MEDIA_FIELDS, MEDIA_LIST_FIELDS,
  streamToResponse, deleteObject,
};
