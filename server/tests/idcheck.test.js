/**
 * Instant ID check (onboarding/idcheck): local checks always; without keys the
 * instant path is closed and the manual review stays the route.
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(60000);
let id;
beforeAll(async () => { await startMongo(); delete process.env.KYC_API_TOKEN; id = require('../src/modules/onboarding/idcheck'); });
afterAll(stopMongo);

// A valid number from any 11 digits: append its Verhoeff check digit.
function withCheckDigit(base) {
  for (let d = 0; d <= 9; d += 1) if (id.aadhaarValid(`${base}${d}`)) return `${base}${d}`;
  return null;
}

test('Aadhaar checksum and PAN format catch typos with no keys', () => {
  const good = withCheckDigit('23456789012');
  expect(good).toHaveLength(12);
  const typo = `${good.slice(0, 5)}${(Number(good[5]) + 1) % 10}${good.slice(6)}`;
  expect(id.aadhaarValid(typo)).toBe(false);
  expect(id.aadhaarValid('123456789012')).toBe(false); // cannot start with 0 or 1
  expect(id.panValid('ABCDE1234F')).toBe(true);
  expect(id.panValid('ABCD1234F')).toBe(false);
});

test('names: same person in another order or with initials matches; a different person does not', () => {
  expect(id.nameScore('Mohammed Faizan', 'Faizan Mohammed')).toBe(1);
  expect(id.nameScore('K Ravi Kumar', 'Ravi Kumar K')).toBeGreaterThanOrEqual(0.6);
  expect(id.nameScore('Sita Devi', 'Ravi Kumar')).toBe(0);
});

test('without keys: the instant check is not offered, the manual review stays', async () => {
  const owner = { kind: 'worker', id: new mongoose.Types.ObjectId() };
  await expect(id.startAadhaar({ owner, aadhaar: '1234' })).rejects.toMatchObject({ code: 'AADHAAR_INVALID' });
  await expect(id.startAadhaar({ owner, aadhaar: withCheckDigit('23456789012') })).rejects.toMatchObject({ code: 'ID_CHECK_MANUAL' });
  expect(await id.verifyPan({ owner, pan: 'ABCDE1234F' })).toMatchObject({ status: 'manual' });
  expect(await id.statusFor(owner)).toMatchObject({ instant: false, aadhaar: null, pan: null });
});
