// Each service reads in its own words: a dance class has a teacher and no warranty, a phone repair keeps its technician and device; the server list, messages and screens agree.
const path = require('path');
const { execFileSync } = require('child_process');
const request = require('supertest');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
let app; let ServiceDomain; let ServiceLine;

beforeAll(async () => {
  await startMongo();
  app = require('../src/app')();
  ({ ServiceDomain, ServiceLine } = require('../src/modules/onboarding/onboarding.model'));
  await ServiceDomain.create([{ code: 'local_pros', name: 'Local pros' }, { code: 'electronics', name: 'Electronics' }]);
  await ServiceLine.create([
    { code: 'dance_001', name: 'Dance 001', domainCode: 'local_pros', repairVertical: 'dance_001', packageDef: { types: [{ code: 'one', name: 'Standard' }] } },
    { code: 'mobile_phones', name: 'Mobile Phones', domainCode: 'electronics', repairVertical: 'mobile' },
  ]);
});
afterAll(stopMongo);

test('the service list carries each service\'s words', async () => {
  const { body } = await request(app).get('/api/repair/verticals');
  const dance = body.items.find((i) => i.vertical === 'dance_001');
  const phone = body.items.find((i) => i.vertical === 'mobile');
  expect(dance.terms).toMatchObject({ job: 'class', pro: 'teacher', warranty: false, packaged: true, singleType: true, name: 'Dance 001' });
  expect(phone.terms).toMatchObject({ job: 'repair', pro: 'technician', warranty: true, packaged: false });
});

test('an admin word on the domain wins; an unknown vertical reads as a repair', async () => {
  const ws = require('../src/modules/onboarding/workspace');
  expect(ws.termsOf({ code: 'local_pros', dashboard: { labels: { terms: { pro: 'Instructor', warranty: true } } } })).toMatchObject({ job: 'class', pro: 'instructor', warranty: true });
  expect(await ws.termsForVertical('nothing_here')).toMatchObject({ job: 'repair', pro: 'technician', packaged: false });
});

test('messages name who comes in the service\'s word', async () => {
  const f = await require('../src/modules/messaging/facts').jobFacts('repair', { _id: '000000000000000000000001', vertical: 'dance_001', repairCode: 'zumba', priceSnapshot: {}, userId: null });
  expect(f.noun).toBe('teacher');
  const { CATALOG } = require('../src/modules/messaging/catalog');
  const msg = CATALOG['booking.confirmed'].build({ f: { ...f, service: 'Zumba' }, s: { brandName: 'ZappyOne' }, name: 'Abi', url: (l) => l });
  expect(msg.push.body).toBe('Zumba. We are finding the best teacher near you.');
  const phone = CATALOG['booking.confirmed'].build({ f: { kind: 'repair', service: 'Screen', noun: null }, s: { brandName: 'ZappyOne' }, name: 'Abi', url: (l) => l });
  expect(phone.push.body).toMatch(/best technician near you/);
});

test('screens: a dance class shows the class once, the teacher, no warranty; a phone repair is unchanged', () => {
  const shared = path.join(__dirname, '../../shared/src/customer').replace(/\\/g, '/');
  const code = `
    import { termsOf, bookedRows } from 'file:///${shared}/repairBasket.js';
    import { repairStatus } from 'file:///${shared}/repairStatus.js';
    const items = [{ vertical: 'dance_001', terms: { job: 'class', pro: 'teacher', warranty: false, packaged: true, singleType: true, typeWord: '', name: 'Dance 001' } }];
    const dance = termsOf('dance_001', items);
    const phone = termsOf('mobile', items);
    console.log(JSON.stringify({
      danceRows: bookedRows(dance, { device: 'Dan001 One Standard', option: 'Standard', problem: 'Zumba', repair: 'Zumba' }),
      phoneRows: bookedRows(phone, { device: 'Samsung S23', option: 'S23', problem: 'Cracked screen', repair: 'Display replacement' }),
      danceAccepted: repairStatus('WORKER_ACCEPTED', dance), danceChecks: repairStatus('QA_PENDING', dance),
      phoneConfirmed: repairStatus('CONFIRMED', phone), phoneChecks: repairStatus('QA_PENDING', phone),
    }));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code]).toString());
  expect(out.danceRows).toEqual([['Class', 'Zumba']]);
  expect(out.phoneRows).toEqual([['Device', 'Samsung S23'], ['Problem', 'Cracked screen'], ['Repair', 'Display replacement']]);
  expect(out.danceAccepted.label).toBe('Teacher accepted');
  expect(out.danceChecks.hint).toBe('Your teacher is finishing up.');
  expect(out.phoneConfirmed.hint).toBe('Finding a technician for you.');
  expect(out.phoneChecks.hint).toBe('Running post-repair tests.');
});
