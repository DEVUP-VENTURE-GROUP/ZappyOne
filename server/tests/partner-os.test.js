/**
 * ServicePro as a partner OS (shop/partner.service):
 *   - a whole team invited at once, each row reported
 *   - team leads, and a lead assigns only within their group
 *   - automatic dispatch: a job the partner holds goes to a free, on-duty member
 *     (nearest, or in turns); manual partners are left alone
 *   - capacity: a full partner is offered nothing new
 */
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const Shop = require('../src/modules/shop/shop.model');
const Worker = require('../src/modules/worker/worker.model');
const { PetBooking } = require('../src/modules/pet/models/booking.model');
const partner = require('../src/modules/shop/partner.service');

jest.setTimeout(90000);

const HOME = { lat: 17.4483, lng: 78.3915 };
let shop; let n = 0;
const phone = () => { n += 1; return `91000007${String(n).padStart(2, '0')}`.slice(-10).replace(/^0/, '9'); };

async function member(km = 1, extra = {}) {
  return Worker.create({
    name: `Member ${n}`, phone: phone(), shopId: shop._id, kyc: { status: 'approved' }, isOnline: true, lastSeenAt: new Date(),
    currentLocation: { type: 'Point', coordinates: [HOME.lng, HOME.lat + km / 111] }, ...extra,
  });
}
const heldPet = async (extra = {}) => {
  const { insertedId } = await PetBooking.collection.insertOne({
    reference: `ZPP${Math.random().toString(36).slice(2, 7)}`, userId: new mongoose.Types.ObjectId(), categoryCode: 'pet_grooming', serviceMode: 'doorstep',
    status: 'PROVIDER_ACCEPTED', shopId: shop._id, workerId: null, declinedBy: [], serviceLocation: { type: 'Point', coordinates: [HOME.lng, HOME.lat], address: 'x' },
    pets: [], pricing: { totalPaise: 50000, providerAmountPaise: 40000 }, statusHistory: [], createdAt: new Date(), updatedAt: new Date(), ...extra,
  });
  return insertedId;
};

beforeAll(async () => {
  await startMongo();
  await Promise.all([PetBooking.init(), Worker.init()]);
  shop = await Shop.create({ businessName: 'Sri Sai Services', ownerName: 'Srinivas', phone: phone(), partnerType: 'agency' });
});
afterAll(stopMongo);

test('invite a whole team at once; each row says how it went', async () => {
  const out = await partner.invite(shop._id, [{ phone: phone(), name: 'Ravi' }, { phone: phone(), name: 'Kiran' }, { phone: '9', name: 'Bad' }]);
  expect(out.added).toBe(2);
  expect(out.rows.filter((r) => r.ok)).toHaveLength(2);
});

test('a lead assigns only within their group', async () => {
  const lead = await member();
  const mine = await member();
  const other = await member();
  await partner.setRole(shop._id, lead._id, { role: 'lead' });
  await partner.setRole(shop._id, mine._id, { leadId: lead._id });
  await expect(partner.assertLeadMayAssign(lead._id, mine._id)).resolves.toBeTruthy();
  await expect(partner.assertLeadMayAssign(lead._id, other._id)).rejects.toMatchObject({ code: 'NOT_YOUR_GROUP' });
  await expect(partner.assertLeadMayAssign(mine._id, other._id)).rejects.toMatchObject({ code: 'NOT_A_LEAD' });
});

test('automatic dispatch: the nearest free member gets a job the partner holds', async () => {
  await Worker.deleteMany({ shopId: shop._id });
  const far = await member(4);
  const near = await member(0.5);
  void far;
  await partner.saveSettings(shop._id, { mode: 'nearest' });
  const id = await heldPet();
  const out = await partner.dispatchSweep();
  expect(out.assigned).toBeGreaterThanOrEqual(1);
  expect(String((await PetBooking.findById(id).lean()).workerId)).toBe(String(near._id));
});

test('in turns: the member given a job longest ago is next', async () => {
  await Worker.deleteMany({ shopId: shop._id });
  await PetBooking.deleteMany({});
  const recent = await member(0.5, { team: { role: 'member', lastAssignedAt: new Date() } });
  const waiting = await member(3, { team: { role: 'member', lastAssignedAt: new Date(Date.now() - 86400000) } });
  void recent;
  await partner.saveSettings(shop._id, { mode: 'round_robin' });
  const id = await heldPet();
  await partner.dispatchSweep();
  expect(String((await PetBooking.findById(id).lean()).workerId)).toBe(String(waiting._id));
});

test('manual partners are left to assign themselves', async () => {
  await partner.saveSettings(shop._id, { mode: 'manual' });
  await PetBooking.deleteMany({});
  const id = await heldPet();
  await partner.dispatchSweep();
  expect((await PetBooking.findById(id).lean()).workerId).toBeNull();
});

test('a partner at its capacity is full', async () => {
  await PetBooking.deleteMany({});
  await partner.saveSettings(shop._id, { capacity: 2 });
  await heldPet(); expect((await partner.atCapacity([shop._id])).has(String(shop._id))).toBe(false);
  await heldPet(); expect((await partner.atCapacity([shop._id])).has(String(shop._id))).toBe(true);
  const s = await partner.settingsOf(shop._id);
  expect(s).toMatchObject({ partnerType: 'agency', dispatch: { capacity: 2 }, openJobs: 2 });
});

test('insights count the partner’s finished jobs per member and per day', async () => {
  const out = await partner.insights(shop._id, 30);
  expect(out.days.length).toBeGreaterThanOrEqual(30);
  expect(out).toHaveProperty('totals.team');
});
