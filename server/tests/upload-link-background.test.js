// A normal upload link lasts 5 minutes; only a phone handing the photo to Android's WorkManager asks for one that lasts an hour.
const seen = [];
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: async (client, cmd, opts) => { seen.push(opts.expiresIn); return 'https://bucket.example/put'; } }));

beforeAll(() => Object.assign(require('../src/config').aws, { bucket: 'b', accessKeyId: 'k', secretAccessKey: 's' }));
beforeEach(() => { seen.length = 0; });

const s3 = require('../src/core/storage/s3');

test('a normal upload gets the short link', async () => {
  await s3.getUploadUrl({ folder: 'kyc', contentType: 'image/jpeg', userId: 'u1' });
  expect(seen).toEqual([300]);
});

test('a background upload gets an hour, enough to wait for signal', async () => {
  const out = await s3.getUploadUrl({ folder: 'kyc', contentType: 'image/jpeg', userId: 'u1', background: true });
  expect(seen).toEqual([3600]);
  expect(out.key).toMatch(/^kyc\/u1\//);
});
