// ServicePro module 2, the profile gate: every field of every account kind, empty, short, wrong and valid, decides the same list on web and app.
const { RULES } = require('../src/modules/onboarding/profile-check');

const missingOf = (role, doc) => RULES[role](doc).filter(([, , done, , optional]) => !done && !optional).map(([key]) => key);
const upiDone = (role, doc) => RULES[role](doc).find(([key]) => key === 'upi')?.[2];

const SHOP = {
  businessName: 'Ravi Electricals', ownerName: 'Ravi', email: 'ravi@example.com',
  address: { text: 'Plot 4, Kondapur', location: { coordinates: [78.36, 17.46] } }, coverImageUrl: 'shop/a.jpg',
  hours: [{ day: 1 }], bio: 'Wiring, fans and switchboards at home since 2015.', yearsActive: 9,
  kyc: { status: 'pending_review' }, savedUpiIds: [{ upiId: 'ravi@okaxis' }],
};
const PARTNER = {
  businessName: 'Gayatri Events', ownerName: 'Gayatri', cities: ['hyderabad'], profilePhotoKey: 'p/a.jpg',
  bio: 'Birthday and baby shower decoration across Hyderabad.', yearsExperience: 4, kyc: { status: 'pending' },
};
const WORKER = { name: 'Suresh', profilePhotoKey: 'w/a.jpg', kyc: { status: 'pending_review' }, savedUpiIds: [{ upiId: 'suresh@ybl' }] };

const BLANKS = [undefined, null, '', '   '];

describe('a complete account opens the dashboard', () => {
  test.each([['shop', SHOP], ['event_partner', PARTNER], ['worker', WORKER]])('%s', (role, doc) => {
    expect(missingOf(role, doc)).toEqual([]);
  });
});

describe('shop: each text field empty or blank blocks only that step', () => {
  const cases = [];
  for (const [field, key] of [['businessName', 'businessName'], ['ownerName', 'ownerName'], ['email', 'email'], ['coverImageUrl', 'photo'], ['bio', 'bio']]) {
    for (const v of BLANKS) cases.push([field, JSON.stringify(v), v, key]);
  }
  test.each(cases)('%s = %s', (field, _label, v, key) => {
    expect(missingOf('shop', { ...SHOP, [field]: v })).toEqual([key]);
  });
});

describe('shop: too-short values are refused', () => {
  test.each([
    ['businessName', 'R', 'businessName'], ['ownerName', 'R', 'ownerName'], ['email', 'a@b', 'email'],
    ['bio', 'Short bio', 'bio'], ['bio', 'x'.repeat(29), 'bio'], ['bio', `  ${'x'.repeat(28)}  `, 'bio'],
  ])('%s = %j', (field, v, key) => {
    expect(missingOf('shop', { ...SHOP, [field]: v })).toEqual([key]);
  });
  test('a bio of exactly 30 letters is enough', () => {
    expect(missingOf('shop', { ...SHOP, bio: 'x'.repeat(30) })).toEqual([]);
  });
});

describe('shop: address needs both text and a map pin', () => {
  test.each([
    ['no address', undefined],
    ['text only', { text: 'Plot 4, Kondapur' }],
    ['pin only', { location: { coordinates: [78.36, 17.46] } }],
    ['short text', { text: 'Pl', location: { coordinates: [78.36, 17.46] } }],
    ['pin with one number', { text: 'Plot 4, Kondapur', location: { coordinates: [78.36] } }],
    ['empty pin', { text: 'Plot 4, Kondapur', location: { coordinates: [] } }],
  ])('%s', (_name, address) => {
    expect(missingOf('shop', { ...SHOP, address })).toEqual(['address']);
  });
});

describe('shop: hours and years', () => {
  test.each([[undefined], [null], [[]]])('hours %j', (hours) => expect(missingOf('shop', { ...SHOP, hours })).toEqual(['hours']));
  test.each([[undefined], [null], [NaN], [-1], ['5'], [Infinity]])('years %j blocks', (yearsActive) => expect(missingOf('shop', { ...SHOP, yearsActive })).toEqual(['years']));
  test.each([[0], [1], [40]])('years %j is fine (a new business counts)', (yearsActive) => expect(missingOf('shop', { ...SHOP, yearsActive })).toEqual([]));
});

describe('identity documents: only sent or approved count', () => {
  test.each([
    ['shop', SHOP, 'pending_review', true], ['shop', SHOP, 'approved', true], ['shop', SHOP, 'not_submitted', false],
    ['shop', SHOP, 'rejected', false], ['shop', SHOP, undefined, false], ['shop', SHOP, '', false],
    ['event_partner', PARTNER, 'pending', true], ['event_partner', PARTNER, 'approved', true], ['event_partner', PARTNER, 'not_submitted', false],
    ['event_partner', PARTNER, 'rejected', false], ['event_partner', PARTNER, undefined, false],
    ['worker', WORKER, 'pending_review', true], ['worker', WORKER, 'approved', true], ['worker', WORKER, 'rejected', false], ['worker', WORKER, 'not_submitted', false],
  ])('%s kyc %s', (role, doc, status, ok) => {
    expect(missingOf(role, { ...doc, kyc: status === undefined ? undefined : { status } })).toEqual(ok ? [] : ['kyc']);
  });
});

describe('UPI ID: the shape customers can pay', () => {
  test.each(['ravi@okaxis', 'ravi.kumar@ybl', 'r_k-9@paytm', '9876543210@upi', 'ab@sbi', '  ravi@okicici  '])('%s is accepted', (upiId) => {
    expect(upiDone('shop', { ...SHOP, savedUpiIds: [{ upiId }] })).toBe(true);
  });
  test.each(['', 'ravi', '@okaxis', 'ravi@', 'ravi@1bank', 'ra vi@okaxis', 'ravi@@okaxis', 'r@x', 'ravi@ok axis', 'ravi#@okaxis'])('%j is refused', (upiId) => {
    expect(upiDone('shop', { ...SHOP, savedUpiIds: [{ upiId }] })).toBe(false);
  });
  test('one good ID among bad ones is enough', () => {
    expect(upiDone('shop', { ...SHOP, savedUpiIds: [{ upiId: 'bad' }, { upiId: 'ravi@okaxis' }] })).toBe(true);
  });
  test.each([[undefined], [null], [[]], [[{}]], [[{ upiId: null }]]])('no usable ID %j', (savedUpiIds) => {
    expect(upiDone('shop', { ...SHOP, savedUpiIds })).toBe(false);
    expect(missingOf('shop', { ...SHOP, savedUpiIds })).toEqual([]);
  });
});

describe('event partner fields', () => {
  test.each([
    ['businessName', '', 'businessName'], ['ownerName', ' ', 'ownerName'], ['cities', [], 'cities'], ['cities', undefined, 'cities'],
    ['profilePhotoKey', null, 'photo'], ['bio', 'too short', 'bio'], ['yearsExperience', undefined, 'years'], ['yearsExperience', -2, 'years'],
  ])('%s = %j', (field, v, key) => {
    expect(missingOf('event_partner', { ...PARTNER, [field]: v })).toEqual([key]);
  });
});

describe('worker: who is asked for a UPI ID (optional, never blocks)', () => {
  test.each([
    ['independent, no UPI', {}, true],
    ['a shop technician, no UPI', { shopId: 'x' }, false],
    ['ZappyOne staff, no UPI', { employment: { type: 'staff' } }, false],
    ['a contractor, no UPI', { employment: { type: 'contract' } }, true],
  ])('%s', (_name, extra, asked) => {
    const doc = { ...WORKER, savedUpiIds: [], ...extra };
    expect(RULES.worker(doc).some(([key]) => key === 'upi')).toBe(asked);
    expect(missingOf('worker', doc)).toEqual([]);
  });
  test.each([['name', 'S', 'name'], ['name', '', 'name'], ['profilePhotoKey', '', 'photo'], ['profilePhotoKey', undefined, 'photo']])('%s = %j', (field, v, key) => {
    expect(missingOf('worker', { ...WORKER, [field]: v })).toEqual([key]);
  });
});

describe('an empty or missing record lists every step and never throws', () => {
  test.each([['shop', 9], ['event_partner', 7], ['worker', 3]])('%s', (role, n) => {
    expect(missingOf(role, {})).toHaveLength(n);
  });
});

describe('every step names where it is filled in, inside its own workspace', () => {
  const ROOT = { shop: '/shop/', event_partner: '/partner/', worker: '/worker/' };
  const cases = Object.keys(RULES).flatMap((role) => RULES[role]({}).map(([key, , , path]) => [role, key, path]));
  test.each(cases)('%s %s → %s', (role, _key, path) => {
    expect(path.startsWith(ROOT[role])).toBe(true);
  });
  test('the event partner documents step is the step the app sends to its documents screen', () => {
    expect(RULES.event_partner({}).find(([key]) => key === 'kyc')).toEqual(expect.arrayContaining(['kyc', '/partner/profile']));
  });
});
