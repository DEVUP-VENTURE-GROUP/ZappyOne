/**
 * The legal pages linked from the store listings and every sign-in: added to
 * a database that lacks them, upgraded where the first-shipped text was never
 * edited, never overwriting an admin's edit, and filled with the company
 * details from Admin → Messages → Business details.
 */
const { startMongo, stopMongo } = require('./helpers');
const Content = require('../src/modules/content/content.model');
const { LEGAL_PAGES } = require('../src/modules/content/legal');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

const OLD_REFUND = [
  'We want every booking to go smoothly. This policy explains when and how refunds are issued.',
  '',
  '1. No worker found — If we cannot assign a pro in time and the order is auto-cancelled, any amount you paid is refunded in full to your Zappy wallet.',
  '2. You cancel before the pro starts — If you cancel before service begins, you are refunded minus any applicable cancellation fee shown at the time of cancellation.',
  '3. Worker cancels / no-show — If the pro cancels or does not arrive, you are not charged, and any prepaid amount is refunded in full.',
  '4. Service quality issues — If a completed job has a problem covered by warranty, we re-service it first. Where re-service is not possible, a partial or full refund may be issued after review.',
  '',
  'Refunds are credited to your Zappy wallet, typically instantly. Wallet balance can be used for future bookings. For disputes, open a ticket from Help & Support.',
].join('\n');

test('missing pages are added, an untouched old page is upgraded, an edited page is kept', async () => {
  await Content.create([
    { type: 'faq', question: 'Q?', answer: 'A.' },
    { type: 'policy', slug: 'refund-policy', title: 'Refund Policy', body: OLD_REFUND },
    { type: 'policy', slug: 'privacy-policy', title: 'Privacy', body: 'Our own lawyer wrote this.' },
  ]);
  const svc = require('../src/modules/content/content.service');
  const list = await svc.listPolicies();
  expect(list.map((p) => p.slug).sort()).toEqual(LEGAL_PAGES.map((p) => p.slug).sort());
  const refund = await Content.findOne({ slug: 'refund-policy' }).lean();
  expect(refund.title).toBe('Cancellation and Refund Policy');
  expect((await Content.findOne({ slug: 'privacy-policy' }).lean()).body).toBe('Our own lawyer wrote this.');
});

test('company details fill in, and a line with a blank detail is hidden', () => {
  const { fillTokens } = require('../src/modules/content/content.service');
  const out = fillTokens('By {{legalName}}\nRegistered office: {{address}}\nWrite to {{grievanceEmail}}', {
    legalName: 'DEVUP ECOSYSTEM PVT LTD', address: '', supportEmail: 'support@zappyone.com', grievanceEmail: '',
  });
  expect(out).toBe('By DEVUP ECOSYSTEM PVT LTD\nWrite to support@zappyone.com');
});

test('every page fits the editor and names no detail that is not filled', () => {
  const known = ['brandName', 'legalName', 'gstin', 'address', 'supportEmail', 'supportPhone', 'customerUrl', 'grievanceOfficer', 'grievanceEmail'];
  for (const p of LEGAL_PAGES) {
    expect(p.body.length).toBeLessThan(20000);
    for (const [, k] of p.body.matchAll(/\{\{(\w+)\}\}/g)) expect(known).toContain(k);
  }
});
