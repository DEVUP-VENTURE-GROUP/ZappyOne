/**
 * Homepage banner images: a private S3 prefix, admin-only presigned uploads,
 * and signed reads on the way out.
 *
 *   upload   only an admin with marketing write access may ask; type,
 *            extension and size are refused before anything is signed, and
 *            the signed request itself pins type and length.
 *   storage  a banner stores its key (or an external https link) — never a
 *            temporary signed URL, never a key outside the banner prefix.
 *   reads    the public placement endpoint signs banner keys and drops any
 *            other key, so a banner can't be used to read another file.
 *
 * Presigning is local HMAC work, so this runs with no network or real bucket.
 */
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');
const Admin = require('../src/modules/admin/admin.model');
const Ad = require('../src/modules/ads/ad.model');
const { signAccessToken } = require('../src/modules/auth/token.service');
const s3 = require('../src/core/storage/s3');

jest.setTimeout(60000);

const SLUG = process.env.ADMIN_LOGIN_SLUG;
let app;
const tokens = {};

async function adminToken(role) {
  const admin = await Admin.create({ email: `${role}@banner.test`, name: role, passwordHash: 'x', role });
  return signAccessToken({ sub: String(admin._id), role: 'admin', email: admin.email });
}

const upload = (token, body) => request(app).post(`/api/${SLUG}/ads/banner-upload`).set('Authorization', `Bearer ${token}`).send(body);

const baseAd = (imageUrl, extra = {}) => ({
  title: 'Banner test', type: 'banner', placements: ['home_banner'], status: 'draft',
  content: { headline: 'Hello', imageUrl },
  schedule: { startAt: new Date(Date.now() - 864e5).toISOString(), endAt: new Date(Date.now() + 864e5).toISOString() },
  ...extra,
});

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  tokens.marketing = await adminToken('marketing');
  tokens.support = await adminToken('support');
  tokens.finance = await adminToken('finance');
  tokens.user = signAccessToken({ sub: '64b000000000000000000001', role: 'user' });
});
afterAll(stopMongo);

describe('banner upload authorisation', () => {
  test('an admin with marketing write access gets a short-lived link into the banner prefix', async () => {
    const res = await upload(tokens.marketing, { contentType: 'image/webp', size: 120000, filename: 'hero.webp' });
    expect(res.status).toBe(200);
    expect(s3.isBannerKey(res.body.key)).toBe(true);
    expect(res.body.key.startsWith('homepage-banners/')).toBe(true);
    expect(res.body.expiresIn).toBe(300);
    const url = new URL(res.body.uploadUrl);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    // Type and length are part of the signature, so S3 refuses any other file.
    const signed = url.searchParams.get('X-Amz-SignedHeaders').split(';');
    expect(signed).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host']));
    // The response carries a link and a key, nothing else — no credentials.
    expect(Object.keys(res.body).sort()).toEqual(['expiresIn', 'headers', 'key', 'uploadUrl']);
  });

  test('a key sent by the client is ignored; the server always mints its own', async () => {
    const res = await upload(tokens.marketing, { contentType: 'image/jpeg', size: 10, filename: 'a.jpg', key: 'kyc/x.jpg' });
    expect(res.status).toBe(200);
    expect(res.body.key).not.toBe('kyc/x.jpg');
    expect(s3.isBannerKey(res.body.key)).toBe(true);
  });

  test('every link names a fresh, unguessable key', async () => {
    const a = await upload(tokens.marketing, { contentType: 'image/png', size: 10, filename: 'a.png' });
    const b = await upload(tokens.marketing, { contentType: 'image/png', size: 10, filename: 'a.png' });
    expect(a.body.key).not.toBe(b.body.key);
    expect(a.body.key).toMatch(/\.png$/);
  });

  test('admins without marketing write access, and non-admins, are refused', async () => {
    expect((await upload(tokens.support, { contentType: 'image/png', size: 10, filename: 'a.png' })).status).toBe(403);
    expect((await upload(tokens.finance, { contentType: 'image/png', size: 10, filename: 'a.png' })).status).toBe(403);
    expect((await upload(tokens.user, { contentType: 'image/png', size: 10, filename: 'a.png' })).status).toBe(403);
    expect((await request(app).post(`/api/${SLUG}/ads/banner-upload`).send({})).status).toBe(401);
  });

  test.each([
    ['an unsupported type', { contentType: 'image/gif', size: 10, filename: 'a.gif' }],
    ['a document', { contentType: 'application/pdf', size: 10, filename: 'a.pdf' }],
    ['an extension that does not match', { contentType: 'image/png', size: 10, filename: 'shell.php' }],
    ['a file over 5 MB', { contentType: 'image/jpeg', size: 5 * 1024 * 1024 + 1, filename: 'big.jpg' }],
    ['an empty file', { contentType: 'image/jpeg', size: 0, filename: 'a.jpg' }],
  ])('refuses %s', async (_, body) => {
    const res = await upload(tokens.marketing, body);
    expect(res.status).toBe(400);
    expect(res.body.uploadUrl).toBeUndefined();
  });
});

describe('what a banner stores', () => {
  let key;
  beforeAll(async () => {
    key = (await upload(tokens.marketing, { contentType: 'image/jpeg', size: 2048, filename: 'b.jpg' })).body.key;
  });

  const create = (body) => request(app).post(`/api/${SLUG}/ads`).set('Authorization', `Bearer ${tokens.marketing}`).send(body);

  test('an uploaded key is stored as the key and answered as a signed link', async () => {
    const res = await create(baseAd(key));
    expect(res.status).toBe(201);
    const saved = await Ad.findById(res.body.ad._id).lean();
    expect(saved.content.imageUrl).toBe(key);
    expect(res.body.ad.content.imageUrl).toMatch(/^https:\/\/.+X-Amz-Signature=/);
  });

  test('a signed link sent back on save is reduced to its key, never stored', async () => {
    const signed = await s3.signBannerImage(key);
    const res = await create(baseAd(signed));
    expect(res.status).toBe(201);
    expect((await Ad.findById(res.body.ad._id).lean()).content.imageUrl).toBe(key);
  });

  test('an external https link is kept as given', async () => {
    const res = await create(baseAd('https://cdn.example.com/banner.webp'));
    expect((await Ad.findById(res.body.ad._id).lean()).content.imageUrl).toBe('https://cdn.example.com/banner.webp');
  });

  test.each([
    ['another folder', 'kyc/64b000000000000000000001/abc'],
    ['path traversal', 'homepage-banners/../kyc/secret.jpg'],
    ['a made-up banner key', 'homepage-banners/2026/01/not-a-uuid.jpg'],
    ['plain http', 'http://cdn.example.com/banner.webp'],
  ])('refuses %s', async (_, imageUrl) => {
    const res = await create(baseAd(imageUrl));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BANNER_IMAGE_INVALID');
  });

  test('editing a banner follows the same rules: replace, refuse, remove', async () => {
    const ad = (await create(baseAd(''))).body.ad;
    const patch = (body) => request(app).patch(`/api/${SLUG}/ads/${ad._id}`).set('Authorization', `Bearer ${tokens.marketing}`).send(body);
    expect((await patch({ content: { headline: 'Hi', imageUrl: key } })).status).toBe(200);
    expect((await Ad.findById(ad._id).lean()).content.imageUrl).toBe(key);
    expect((await patch({ content: { headline: 'Hi', imageUrl: 'kyc/x/y' } })).status).toBe(400);
    expect((await Ad.findById(ad._id).lean()).content.imageUrl).toBe(key);
    expect((await patch({ content: { headline: 'Hi', imageUrl: '' } })).status).toBe(200);
    expect((await Ad.findById(ad._id).lean()).content.imageUrl).toBe('');
  });

  test('a house banner’s order changes by sending its whole billing object (dotted keys are stripped)', async () => {
    const ad = (await create(baseAd(''))).body.ad;
    const res = await request(app).patch(`/api/${SLUG}/ads/${ad._id}`).set('Authorization', `Bearer ${tokens.marketing}`)
      .send({ billing: { ...ad.billing, rate: 7 }, status: 'draft' });
    expect(res.status).toBe(200);
    expect((await Ad.findById(ad._id).lean()).billing).toMatchObject({ model: 'fixed', rate: 7, budget: 0 });
  });

  test('a content edit leaves a paid campaign’s billing exactly as it was', async () => {
    const paid = await Ad.create({ ...baseAd(''), status: 'active', billing: { model: 'cpm', rate: 250, budget: 100000 } });
    const res = await request(app).patch(`/api/${SLUG}/ads/${paid._id}`).set('Authorization', `Bearer ${tokens.marketing}`)
      .send({ content: { headline: 'Edited', imageUrl: key }, status: 'active' });
    expect(res.status).toBe(200);
    const after = await Ad.findById(paid._id).lean();
    expect(after.billing).toMatchObject({ model: 'cpm', rate: 250, budget: 100000 });
    expect(after.content.imageUrl).toBe(key);
  });
});

describe('signed reads on the homepage', () => {
  test('banner keys are signed for 6 hours; other keys are dropped; external links pass through', async () => {
    await Ad.deleteMany({});
    const key = (await upload(tokens.marketing, { contentType: 'image/webp', size: 99, filename: 'c.webp' })).body.key;
    const live = (imageUrl, title) => Ad.create({ ...baseAd(imageUrl), title, status: 'active' });
    await live(key, 'uploaded');
    await live('kyc/64b000000000000000000001/private-id', 'foreign'); // written around the API, as old data might be
    await live('https://cdn.example.com/x.webp', 'external');

    const res = await request(app).get('/api/ads/placement/home_banner').query({ limit: 10 });
    expect(res.status).toBe(200);
    const byTitle = Object.fromEntries(res.body.ads.map((a) => [a.title, a.content.imageUrl]));
    const signed = new URL(byTitle.uploaded);
    expect(signed.pathname).toContain(key);
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('21600');
    expect(byTitle.foreign).toBe('');
    expect(byTitle.external).toBe('https://cdn.example.com/x.webp');
  });
});
