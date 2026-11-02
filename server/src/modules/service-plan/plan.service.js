// Partner plans end to end: a ServicePro partner sets a monthly plan or pack, it goes live in the price band or waits for review, customers near them subscribe, every visit is booked up front with a start code, and each plan month's cash commission is booked as the partner's dues at its first finished visit.
const crypto = require('crypto');
const mongoose = require('mongoose');
const { httpError } = require('../../core/errors');
const logger = require('../../core/logger');
const { ServicePlan, PlanSubscription, PlanVisit, PlanConfig } = require('./plan.model');

const DAY_MS = 86400000;
const istDay = (d = new Date()) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
const atIst = (day, hhmm) => new Date(`${day}T${hhmm}:00+05:30`);
const addDays = (day, n) => istDay(new Date(atIst(day, '12:00').getTime() + n * DAY_MS));
const addMonths = (day, n) => { const [y, m, d] = day.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, d)); return t.toISOString().slice(0, 10); };
const weekdayOf = (day) => atIst(day, '12:00').getUTCDay();
const code = () => String(crypto.randomInt(1000, 10000));
const ownerKey = (o) => ({ 'owner.kind': o.kind, 'owner.id': new mongoose.Types.ObjectId(String(o.id)) });
// A shop's technician works the visits the owner assigned them, as well as any plan of their own.
const visitScope = (o) => (o.kind === 'worker' ? { $or: [ownerKey(o), { workerId: new mongoose.Types.ObjectId(String(o.id)) }] } : ownerKey(o));

async function config() {
  return (await PlanConfig.findOne({ key: 'main' }).lean()) || (await PlanConfig.create({ key: 'main' })).toObject();
}

async function setConfig(patch) {
  return PlanConfig.findOneAndUpdate({ key: 'main' }, { $set: patch }, { upsert: true, new: true, runValidators: true }).lean();
}

// The standard price of one visit of this plan, from ZappyOne's reference prices.
async function referenceVisitPaise(vertical, items) {
  const { resolveReferencePrice } = require('../repair/services/pricing.service');
  let sum = 0;
  for (const i of items) {
    const ref = await resolveReferencePrice({ vertical, repairCode: i.repairCode, brandCode: i.brandCode });
    if (!ref) return null;
    sum += ref.recommendedPaise;
  }
  return sum;
}

async function assertCanSell(owner, vertical) {
  const line = await require('../jobs/kinds').KINDS.repair.line({ vertical });
  if (!line) throw httpError('That service is not open.', 400, 'UNKNOWN_SERVICE');
  await require('../onboarding/eligibility').assertApproved({ role: owner.kind, id: owner.id }, line);
}

async function cleanItems(vertical, items) {
  const { Repair } = require('../repair/models/repair.model');
  const repairs = await Repair.find({ vertical, code: { $in: items.map((i) => i.repairCode) }, isActive: true }).select('code name').lean();
  const byCode = new Map(repairs.map((r) => [r.code, r]));
  if (items.some((i) => !byCode.has(i.repairCode))) throw httpError('A job in this plan is not part of the service.', 400, 'BAD_ITEM');
  return items.map((i) => ({ repairCode: i.repairCode, brandCode: i.brandCode || null, name: byCode.get(i.repairCode).name }));
}

async function savePlan(owner, body, planId = null) {
  await assertCanSell(owner, body.vertical);
  const items = await cleanItems(body.vertical, body.items);
  const durations = (body.durations?.length ? body.durations : [{ months: 1, discountPct: 0 }]).filter((d, i, a) => a.findIndex((x) => x.months === d.months) === i);
  if (!durations.some((d) => d.months === 1) && body.type === 'monthly') durations.unshift({ months: 1, discountPct: 0 });
  const visitsPerMonth = body.type === 'pack' ? 1 : body.visitsPerMonth;
  const perVisit = await referenceVisitPaise(body.vertical, items);
  const set = {
    vertical: body.vertical, name: body.name, description: body.description || '', type: body.type, items, visitsPerMonth,
    weekdays: body.type === 'pack' ? [] : (body.weekdays || []), pricePaise: body.pricePaise,
    durations: body.type === 'pack' ? [{ months: 1, discountPct: 0 }] : durations,
    pauseDaysPerMonth: body.type === 'pack' ? 0 : (body.pauseDaysPerMonth ?? 4),
    referencePaise: perVisit == null ? null : perVisit * visitsPerMonth, status: 'draft', reviewNote: '',
  };
  if (planId) {
    const r = await ServicePlan.findOneAndUpdate({ _id: planId, ...ownerKey(owner) }, { $set: set }, { new: true }).lean();
    if (!r) throw httpError('Plan not found.', 404, 'NOT_FOUND');
    return r;
  }
  if (await ServicePlan.countDocuments({ ...ownerKey(owner), status: { $ne: 'rejected' } }) >= 30) throw httpError('You can have up to 30 plans.', 409, 'PLAN_LIMIT');
  return (await ServicePlan.create({ owner: { kind: owner.kind, id: owner.id }, ...set })).toObject();
}

// Inside the band of the standard price it goes live at once; outside, or with no standard price to compare, admin reviews it.
async function submitPlan(owner, planId) {
  const plan = await ServicePlan.findOne({ _id: planId, ...ownerKey(owner) });
  if (!plan) throw httpError('Plan not found.', 404, 'NOT_FOUND');
  if (!['draft', 'paused', 'rejected'].includes(plan.status)) throw httpError('This plan is already submitted.', 409, 'ALREADY_SUBMITTED');
  await assertCanSell(owner, plan.vertical);
  const cfg = await config();
  const pct = plan.referencePaise ? (plan.pricePaise / plan.referencePaise) * 100 : null;
  plan.status = pct != null && pct >= cfg.autoApproveMinPct && pct <= cfg.autoApproveMaxPct ? 'live' : 'pending';
  plan.reviewNote = plan.status === 'pending' ? (pct == null ? 'No standard price to compare with; ZappyOne will review it.' : `The price is ${Math.round(pct)}% of the standard price; ZappyOne will review it.`) : '';
  await plan.save();
  return plan.toObject();
}

async function setPlanLive(owner, planId, live) {
  const plan = await ServicePlan.findOneAndUpdate({ _id: planId, ...ownerKey(owner), status: live ? 'paused' : 'live' }, { $set: { status: live ? 'live' : 'paused' } }, { new: true }).lean();
  if (!plan) throw httpError('That plan cannot be changed now.', 409, 'BAD_STATE');
  return plan;
}

async function reviewPlan(planId, approve, note = '') {
  const plan = await ServicePlan.findOneAndUpdate({ _id: planId, status: 'pending' }, { $set: { status: approve ? 'live' : 'rejected', reviewNote: note } }, { new: true }).lean();
  if (!plan) throw httpError('No plan waiting for review with that id.', 404, 'NOT_FOUND');
  return plan;
}

// What a partner can put in a plan: every service they are verified for, with the jobs they have approved prices for.
async function sellable(owner) {
  const { ProviderEnrolment, ServiceLine } = require('../onboarding/onboarding.model');
  const rows = await ProviderEnrolment.find({ [owner.kind === 'shop' ? 'shopId' : 'workerId']: owner.id, status: 'approved' }).select('lineCode').lean();
  const lines = await ServiceLine.find({ code: { $in: rows.map((r) => r.lineCode) }, repairVertical: { $nin: [null, ''] } }).select('code name repairVertical').lean();
  const { storefrontMenu } = require('../repair/services/storefront.service');
  const out = [];
  for (const l of lines) {
    const menu = await storefrontMenu({ kind: owner.kind, id: String(owner.id), vertical: l.repairVertical });
    if (menu?.items?.length) out.push({ vertical: l.repairVertical, name: l.name, items: menu.items.map((i) => ({ repairCode: i.repairCode, name: i.name, minutes: i.minutes, options: i.options.map((o) => ({ brandCode: o.brandCode, typeName: o.typeName, totalPaise: o.totalPaise })) })) });
  }
  return out;
}

const mine = (owner) => ServicePlan.find({ ...ownerKey(owner) }).sort({ updatedAt: -1 }).limit(50).lean();
const pending = () => ServicePlan.find({ status: 'pending' }).sort({ updatedAt: 1 }).limit(100).lean();

// Live plans from providers who cover this address for this service right now (the storefront rules).
async function plansNear({ vertical, lat, lng }) {
  const { items } = await require('../repair/services/storefront.service').listStorefronts({ vertical, lat, lng, limit: 50 });
  if (!items.length) return [];
  const byOwner = new Map(items.map((s) => [`${s.kind}:${s.id}`, s]));
  const plans = await ServicePlan.find({ vertical, status: 'live', $or: items.map((s) => ({ 'owner.kind': s.kind, 'owner.id': new mongoose.Types.ObjectId(s.id) })) }).lean();
  const cfg = await config();
  return plans.map((p) => {
    const s = byOwner.get(`${p.owner.kind}:${p.owner.id}`);
    return {
      ...p, provider: { kind: s.kind, id: s.id, name: s.name, rating: s.rating, completedJobs: s.completedJobs, imageUrl: s.imageUrl },
      platformFeePaise: cfg.platformFeePaise,
      perVisitPaise: Math.round(p.pricePaise / (p.visitsPerMonth || 1)),
      savingsPct: p.referencePaise ? Math.max(0, Math.round((1 - p.pricePaise / p.referencePaise) * 100)) : null,
    };
  }).sort((a, b) => a.perVisitPaise - b.perVisitPaise);
}

// The home's rail: live plans near the customer across every service, cheapest per visit first; at most 8 services are checked so the home stays fast.
async function plansNearAny({ lat, lng, limit = 12 }) {
  const verticals = (await ServicePlan.distinct('vertical', { status: 'live' })).slice(0, 8);
  const lists = await Promise.all(verticals.map((vertical) => plansNear({ vertical, lat, lng }).catch(() => [])));
  return lists.flat().sort((a, b) => a.perVisitPaise - b.perVisitPaise).slice(0, limit);
}

function quoteOf(plan, months, cfg) {
  const d = plan.durations.find((x) => x.months === months);
  if (!d) throw httpError('That duration is not offered for this plan.', 400, 'BAD_DURATION');
  const monthlyPaise = Math.round(plan.pricePaise * (1 - d.discountPct / 100));
  return { months, discountPct: d.discountPct, monthlyPaise, platformFeePaise: cfg.platformFeePaise, totalPaise: (monthlyPaise + cfg.platformFeePaise) * months };
}

async function quote(planId, months) {
  const plan = await ServicePlan.findOne({ _id: planId, status: 'live' }).lean();
  if (!plan) throw httpError('This plan is not available.', 404, 'NOT_FOUND');
  return quoteOf(plan, months, await config());
}

// The days a plan month visits on: the chosen weekdays, or spread evenly, never more than the plan's visits.
function visitDays(plan, fromDay, toDay) {
  if (plan.type === 'pack') return [fromDay];
  const days = [];
  for (let d = fromDay; d < toDay; d = addDays(d, 1)) days.push(d);
  const allowed = plan.weekdays?.length ? days.filter((d) => plan.weekdays.includes(weekdayOf(d))) : days;
  if (allowed.length <= plan.visitsPerMonth) return allowed;
  const step = allowed.length / plan.visitsPerMonth;
  return Array.from({ length: plan.visitsPerMonth }, (_, i) => allowed[Math.floor(i * step)]);
}

async function subscribe(userId, { planId, months, startDay, timeSlot, address, idempotencyKey }) {
  const existing = await PlanSubscription.findOne({ userId, idempotencyKey }).lean();
  if (existing) return { subscription: existing, replay: true };
  await require('../jobs/customer-gate').assertCustomerCanBook(userId);
  const plan = await ServicePlan.findOne({ _id: planId, status: 'live' }).lean();
  if (!plan) throw httpError('This plan is not available.', 404, 'NOT_FOUND');
  if (startDay < istDay()) throw httpError('Pick today or a later day to start.', 400, 'PAST');
  if (startDay > addDays(istDay(), 30)) throw httpError('Start within the next 30 days.', 400, 'TOO_FAR');
  const covers = (await plansNear({ vertical: plan.vertical, lat: address.lat, lng: address.lng })).some((p) => String(p._id) === String(plan._id));
  if (!covers) throw httpError('This provider does not come to that address. Pick a plan from someone near you.', 409, 'NOT_COVERED');
  const cfg = await config();
  const q = quoteOf(plan, months, cfg);
  const { pctFor } = require('../shop/partner-commission');
  const commissionPct = (await pctFor(plan.owner.kind === 'shop' ? { shopId: plan.owner.id } : { workerId: plan.owner.id })) ?? 0;
  const endDay = plan.type === 'pack' ? addDays(startDay, 1) : addMonths(startDay, months);
  const billing = Array.from({ length: plan.type === 'pack' ? 1 : months }, (_, i) => ({ index: i, fromDay: plan.type === 'pack' ? startDay : addMonths(startDay, i), duePaise: q.monthlyPaise + q.platformFeePaise, settled: false }));

  let sub;
  try {
    sub = await PlanSubscription.create({
      userId, planId: plan._id, owner: plan.owner,
      snapshot: { name: plan.name, type: plan.type, vertical: plan.vertical, items: plan.items, visitsPerMonth: plan.visitsPerMonth, weekdays: plan.weekdays, pauseDaysPerMonth: plan.pauseDaysPerMonth },
      months: plan.type === 'pack' ? 1 : months, address: { text: address.text, location: { type: 'Point', coordinates: [address.lng, address.lat] } },
      timeSlot, startDay, endDay, monthlyPaise: q.monthlyPaise, totalPaise: q.totalPaise, platformFeePaise: q.platformFeePaise, commissionPct,
      billing, idempotencyKey,
    });
  } catch (e) {
    if (e.code === 11000) return { subscription: await PlanSubscription.findOne({ userId, idempotencyKey }).lean(), replay: true };
    throw e;
  }
  const rows = billing.flatMap((b, i) => visitDays(plan, b.fromDay, billing[i + 1]?.fromDay || endDay))
    .map((day) => ({ subscriptionId: sub._id, userId, owner: plan.owner, day, at: atIst(day, timeSlot), startCode: code() }));
  await PlanVisit.insertMany(rows);
  await notifyOwner(plan.owner, 'New plan customer', `${plan.name}: ${rows.length} visits from ${startDay} at ${timeSlot}.`, { subscriptionId: String(sub._id) });
  return { subscription: sub.toObject(), visits: rows.length, replay: false };
}

const billingIndexOf = (sub, day) => sub.billing.reduce((idx, b, i) => (day >= b.fromDay ? i : idx), 0);

// A paused day is made up for with a visit after the plan ends, up to the plan's pause days in each plan month.
async function pauseDay(userId, subId, day) {
  const sub = await PlanSubscription.findOne({ _id: subId, userId, status: 'active' });
  if (!sub) throw httpError('Plan not found.', 404, 'NOT_FOUND');
  if (day <= istDay()) throw httpError('Pause from tomorrow onwards.', 400, 'TOO_LATE');
  const b = billingIndexOf(sub, day);
  const used = sub.pauseDays.filter((d) => billingIndexOf(sub, d) === b).length;
  if (used >= (sub.snapshot.pauseDaysPerMonth || 0)) throw httpError(`You have used all ${sub.snapshot.pauseDaysPerMonth} pause days for this month.`, 409, 'NO_PAUSES_LEFT');
  const v = await PlanVisit.findOneAndUpdate({ subscriptionId: sub._id, day, status: 'scheduled', makeupFor: null }, { $set: { status: 'paused' } }, { new: true });
  if (!v) throw httpError('There is no visit to pause that day.', 404, 'NO_VISIT');
  sub.pauseDays.push(day);
  await sub.save();
  await appendMakeup(sub, v._id);
  return { pausedDay: day, pausesLeft: sub.snapshot.pauseDaysPerMonth - used - 1 };
}

async function appendMakeup(sub, forVisitId) {
  const last = await PlanVisit.findOne({ subscriptionId: sub._id }).sort({ day: -1 }).select('day').lean();
  let day = addDays(last?.day || sub.endDay, 1);
  const wd = sub.snapshot.weekdays || [];
  while (wd.length && !wd.includes(weekdayOf(day))) day = addDays(day, 1);
  await PlanVisit.create({ subscriptionId: sub._id, userId: sub.userId, owner: sub.owner, day, at: atIst(day, sub.timeSlot), startCode: code(), makeupFor: forVisitId }).catch((e) => { if (e.code !== 11000) throw e; });
  await PlanSubscription.updateOne({ _id: sub._id, endDay: { $lte: day } }, { $set: { endDay: addDays(day, 1) } });
}

// Months already paid for are kept; the rest of the visits are cancelled and nothing more is due.
async function cancel(userId, subId, reason = '') {
  const sub = await PlanSubscription.findOne({ _id: subId, userId, status: { $in: ['active', 'paused'] } });
  if (!sub) throw httpError('Plan not found.', 404, 'NOT_FOUND');
  const today = istDay();
  const current = billingIndexOf(sub, today);
  const paidThrough = sub.billing[current]?.settled ? (sub.billing[current + 1]?.fromDay || sub.endDay) : today;
  await PlanVisit.updateMany({ subscriptionId: sub._id, status: 'scheduled', day: { $gte: paidThrough > today ? paidThrough : addDays(today, 1) } }, { $set: { status: 'cancelled' } });
  sub.status = 'cancelled'; sub.cancelledAt = new Date(); sub.cancelReason = reason;
  await sub.save();
  await notifyOwner(sub.owner, 'Plan cancelled', `${sub.snapshot.name} was cancelled by the customer.`, { subscriptionId: String(sub._id) });
  return sub.toObject();
}

async function mySubscriptions(userId) {
  const subs = await PlanSubscription.find({ userId }).sort({ createdAt: -1 }).limit(20).lean();
  const ids = subs.map((s) => s._id);
  const visits = await PlanVisit.find({ subscriptionId: { $in: ids }, day: { $gte: addDays(istDay(), -7) } }).sort({ day: 1 }).limit(500).lean();
  return subs.map((s) => ({ ...s, visits: visits.filter((v) => String(v.subscriptionId) === String(s._id)).slice(0, 40) }));
}

async function ownerVisits(owner, from = istDay(), days = 7) {
  const to = addDays(from, days);
  const rows = await PlanVisit.find({ ...visitScope(owner), day: { $gte: from, $lt: to }, status: { $in: ['scheduled', 'started', 'done', 'missed'] } }).sort({ at: 1 }).limit(500).select('-startCode').lean();
  const subs = await PlanSubscription.find({ _id: { $in: [...new Set(rows.map((r) => String(r.subscriptionId)))] } }).select('snapshot address timeSlot userId').lean();
  const byId = new Map(subs.map((s) => [String(s._id), s]));
  return rows.map((r) => ({ ...r, plan: byId.get(String(r.subscriptionId))?.snapshot?.name, address: byId.get(String(r.subscriptionId))?.address?.text }));
}

async function ownerSubscriptions(owner) {
  return PlanSubscription.find({ ...ownerKey(owner) }).sort({ createdAt: -1 }).limit(200).select('-idempotencyKey').lean();
}

// A shop owner sends one of their own workers; an independent pro does their own visits.
async function assignWorker(owner, visitId, workerId) {
  if (owner.kind !== 'shop') throw httpError('Only a shop assigns its workers.', 403, 'NOT_SHOP');
  const Worker = require('../worker/worker.model');
  if (!await Worker.exists({ _id: workerId, shopId: owner.id, isBlocked: { $ne: true } })) throw httpError('That person is not on your team.', 404, 'NOT_YOUR_WORKER');
  const r = await PlanVisit.findOneAndUpdate({ _id: visitId, ...ownerKey(owner), status: 'scheduled' }, { $set: { workerId } }, { new: true }).select('-startCode').lean();
  if (!r) throw httpError('Visit not found.', 404, 'NOT_FOUND');
  await notifyOwner({ kind: 'worker', id: workerId }, 'Plan visit for you', `A plan visit on ${r.day} is yours. Ask the customer for their code at the door.`, { visitId: String(r._id) });
  return r;
}

// The visit starts only with the code the customer reads out at the door, and no earlier than an hour before it is due.
async function startVisit(owner, visitId, startCode) {
  const v = await PlanVisit.findOne({ _id: visitId, ...visitScope(owner), status: 'scheduled' });
  if (!v) throw httpError('Visit not found.', 404, 'NOT_FOUND');
  if (v.at.getTime() - Date.now() > 60 * 60000) throw httpError('This visit is not due yet.', 409, 'TOO_EARLY');
  const ok = String(startCode || '').length === v.startCode.length && crypto.timingSafeEqual(Buffer.from(String(startCode)), Buffer.from(v.startCode));
  if (!ok) throw httpError('That code is not right. Ask the customer for the code in their app.', 400, 'BAD_CODE');
  v.status = 'started'; v.startedAt = new Date();
  await v.save();
  await require('../notification/notification.service').notify({ recipient: { kind: 'user', id: v.userId }, type: 'plan_update', title: 'Your visit has started', body: 'Your pro is at your door and has started the visit.', data: { subscriptionId: String(v.subscriptionId), visitId: String(v._id) } }).catch(() => {});
  const out = v.toObject(); delete out.startCode;
  return out;
}

async function completeVisit(owner, visitId, { photoKeys = [], note = '' }) {
  if (!photoKeys.length) throw httpError('Add at least one photo of the finished work.', 400, 'PHOTO_REQUIRED');
  if (photoKeys.some((k) => !/^completion-photos\/[\w./-]+$/.test(k) || k.includes('..'))) throw httpError('Upload the photos from the app.', 400, 'BAD_PHOTO');
  const v = await PlanVisit.findOneAndUpdate({ _id: visitId, ...visitScope(owner), status: 'started' }, { $set: { status: 'done', doneAt: new Date(), photoKeys: photoKeys.slice(0, 6), note } }, { new: true }).lean();
  if (!v) throw httpError('Start the visit with the customer code first.', 409, 'NOT_STARTED');
  await settleMonthOnFirstVisit(v);
  await require('../notification/notification.service').notify({ recipient: { kind: 'user', id: v.userId }, type: 'plan_update', title: 'Visit done', body: 'Your plan visit is done. See the photos and rate it.', data: { subscriptionId: String(v.subscriptionId), visitId: String(v._id) } }).catch(() => {});
  return v;
}

// The partner collects each plan month in cash at its first visit; ZappyOne's commission and platform fee are booked as their dues then, so dues never depend on the partner reporting the cash.
async function settleMonthOnFirstVisit(v) {
  const sub = await PlanSubscription.findById(v.subscriptionId);
  if (!sub) return;
  const i = billingIndexOf(sub, v.day);
  const b = sub.billing[i];
  if (!b || b.settled) return;
  const r = await PlanSubscription.updateOne({ _id: sub._id, [`billing.${i}.settled`]: false }, { $set: { [`billing.${i}.settled`]: true, [`billing.${i}.paidAt`]: new Date() } });
  if (!r.modifiedCount) return;
  const commission = Math.round((sub.monthlyPaise * (sub.commissionPct || 0)) / 100);
  await require('../payment/settlement').settleCash({
    source: 'plan', bookingId: `${sub._id}-m${i}`, reference: `${sub.snapshot.name} month ${i + 1}`,
    isShop: sub.owner.kind === 'shop', ownerId: sub.owner.id, totalPaise: b.duePaise, platformPaise: commission + (sub.platformFeePaise || 0), refs: {},
  }).catch((e) => logger.error({ err: e.message, subscriptionId: String(sub._id) }, '[plans] month settlement failed'));
}

async function rateVisit(userId, visitId, { stars, comment = '' }) {
  const v = await PlanVisit.findOneAndUpdate({ _id: visitId, userId, status: 'done', 'rating.stars': { $exists: false } }, { $set: { rating: { stars, comment } } }, { new: true }).select('-startCode').lean();
  if (!v) throw httpError('This visit cannot be rated.', 409, 'NOT_RATEABLE');
  return v;
}

// Visits not started six hours after they were due are missed: the customer gets a makeup visit and the partner's record shows it.
async function sweep(now = new Date()) {
  const late = await PlanVisit.find({ status: 'scheduled', at: { $lt: new Date(now.getTime() - 6 * 3600000) } }).limit(500);
  for (const v of late) {
    const r = await PlanVisit.updateOne({ _id: v._id, status: 'scheduled' }, { $set: { status: 'missed' } });
    if (!r.modifiedCount) continue;
    const sub = await PlanSubscription.findById(v.subscriptionId);
    if (sub && sub.status === 'active') await appendMakeup(sub, v._id);
  }
  const ended = await PlanSubscription.updateMany({ status: 'active', endDay: { $lt: istDay(now) } }, { $set: { status: 'completed' } });
  return { missed: late.length, completed: ended.modifiedCount || 0 };
}

async function notifyOwner(owner, title, body, data) {
  await require('../notification/notification.service').notify({ recipient: { kind: owner.kind, id: owner.id }, type: 'plan_update', title, body, data }).catch(() => {});
}

module.exports = {
  plansNearAny,
  config, setConfig, sellable, savePlan, submitPlan, setPlanLive, reviewPlan, mine, pending, plansNear, quote, subscribe, pauseDay, cancel,
  mySubscriptions, ownerVisits, ownerSubscriptions, assignWorker, startVisit, completeVisit, rateVisit, sweep, visitDays, istDay, addDays,
};
