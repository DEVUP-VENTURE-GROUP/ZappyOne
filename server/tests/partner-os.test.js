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

test('a lead’s board: their group, the jobs they are on, and jobs nobody is on yet', async () => {
  await Worker.deleteMany({ shopId: shop._id });
  await PetBooking.deleteMany({});
  const lead = await member();
  const mine = await member();
  const outsider = await member();
  await partner.setRole(shop._id, lead._id, { role: 'lead' });
  await partner.setRole(shop._id, mine._id, { leadId: lead._id });
  const free = await heldPet();
  const ours = await heldPet({ workerId: mine._id, status: 'PROVIDER_EN_ROUTE' });
  await heldPet({ workerId: outsider._id, status: 'PROVIDER_EN_ROUTE' });
  const board = await partner.leadBoard(lead._id);
  expect(board.members.map((m) => m.id).sort()).toEqual([String(lead._id), String(mine._id)].sort());
  expect(board.jobs.map((j) => j.id).sort()).toEqual([String(free), String(ours)].sort());
  await expect(partner.leadBoard(mine._id)).rejects.toMatchObject({ code: 'NOT_A_LEAD' });
});

describe('partner commission', () => {
  const commission = require('../src/modules/shop/partner-commission');
  const settlement = require('../src/modules/payment/settlement');
  const priced = (extra = {}) => heldPet({ pricing: { totalPaise: 50000, subtotalPaise: 45000, commissionPaise: 4000, commissionBasePaise: 40000, providerAmountPaise: 41000 }, ...extra });

  test('a partner’s rate replaces the service’s commission on the frozen base, and the provider amount moves with it', async () => {
    await PetBooking.deleteMany({});
    const id = await priced({ status: 'PROVIDER_ACCEPTED' });
    const doc = await PetBooking.findById(id);
    expect(await commission.refreeze('pet', doc)).toBe(-2000);
    const after = await PetBooking.findById(id).lean();
    expect(after.pricing).toMatchObject({ commissionPaise: 2000, providerAmountPaise: 43000 });
    expect(await commission.refreeze('pet', doc)).toBe(0);
  });

  test('admin rates apply by kind of partner; individual providers have their own', async () => {
    const cfg = require('../src/modules/pricing/services/config.service');
    await cfg.updateActiveConfig({ partnerCommission: { shop: 5, agency: 8, company: 5, individual: 3 } }, null);
    expect(await commission.pctFor({ shopId: shop._id })).toBe(8);
    const solo = await Worker.create({ name: 'Solo', phone: phone(), kyc: { status: 'approved' } });
    expect(await commission.pctFor({ workerId: solo._id })).toBe(3);
    await cfg.updateActiveConfig({ partnerCommission: { shop: 5, agency: 5, company: 5, individual: 5 } }, null);
  });

  test('a booking priced before the base was frozen keeps its commission', async () => {
    const id = await heldPet();
    expect(await commission.refreeze('pet', await PetBooking.findById(id))).toBe(0);
  });

  test('payout takes the partner rate, whatever the caller froze', async () => {
    await PetBooking.deleteMany({});
    const id = await priced({ status: 'PAYMENT_COMPLETED' });
    const booking = await PetBooking.findById(id);
    const out = await settlement.settleProviderShare({ source: 'pet', booking, reference: 'T1', paymentMethod: 'online', totalPaise: 50000, platformPaise: 4000 });
    expect(out).toMatchObject({ settled: true, ownerKind: 'shop', platformPaise: 2000, providerPaise: 48000 });
  });
});

test('the partner rate is frozen when the job is taken; a later admin change does not touch it', async () => {
  const commission = require('../src/modules/shop/partner-commission');
  const cfg = require('../src/modules/pricing/services/config.service');
  await PetBooking.deleteMany({});
  const id = await heldPet({ pricing: { totalPaise: 50000, subtotalPaise: 45000, commissionPaise: 4000, commissionBasePaise: 40000, providerAmountPaise: 41000 } });
  await commission.refreeze('pet', await PetBooking.findById(id));
  await cfg.updateActiveConfig({ partnerCommission: { shop: 5, agency: 9, company: 5, individual: 5 } }, null);
  expect(await commission.refreeze('pet', await PetBooking.findById(id))).toBe(0);
  expect((await PetBooking.findById(id).lean()).pricing).toMatchObject({ commissionPaise: 2000, partnerRate: { holder: `shop:${shop._id}`, pct: 5 } });
  await cfg.updateActiveConfig({ partnerCommission: { shop: 5, agency: 5, company: 5, individual: 5 } }, null);
});

describe('an agreed rate for one partner', () => {
  const commission = require('../src/modules/shop/partner-commission');

  test('wins over their type’s rate, and the end date brings the type rate back', async () => {
    await commission.setOverride({ kind: 'shop', id: shop._id, pct: 3, note: 'big agency', adminId: null });
    expect(await commission.pctFor({ shopId: shop._id })).toBe(3);
    expect(await commission.rateOf({ kind: 'shop', id: shop._id })).toMatchObject({ pct: 3, typePct: 5, custom: true });
    await Shop.updateOne({ _id: shop._id }, { $set: { 'commissionOverride.until': new Date(Date.now() - 1000) } });
    expect(await commission.rateOf({ kind: 'shop', id: shop._id })).toMatchObject({ pct: 5, custom: false });
    expect((await commission.overrides()).find((r) => r.id === String(shop._id))).toMatchObject({ pct: 3, active: false });
  });

  test('a job taken under the agreed rate keeps it after the rate is cleared', async () => {
    await commission.setOverride({ kind: 'shop', id: shop._id, pct: 2, adminId: null });
    await PetBooking.deleteMany({});
    const id = await heldPet({ pricing: { totalPaise: 50000, subtotalPaise: 45000, commissionPaise: 4000, commissionBasePaise: 40000, providerAmountPaise: 41000 } });
    await commission.refreeze('pet', await PetBooking.findById(id));
    await commission.setOverride({ kind: 'shop', id: shop._id, pct: null, adminId: null });
    await commission.refreeze('pet', await PetBooking.findById(id));
    expect((await PetBooking.findById(id).lean()).pricing.commissionPaise).toBe(800);
    expect(await commission.pctFor({ shopId: shop._id })).toBe(5);
  });

  test('an end date in the past is refused', async () => {
    await expect(commission.setOverride({ kind: 'shop', id: shop._id, pct: 4, until: new Date(Date.now() - 86400000), adminId: null })).rejects.toMatchObject({ code: 'BAD_UNTIL' });
  });
});
