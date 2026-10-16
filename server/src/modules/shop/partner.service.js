/**
 * ServicePro as a partner OS: shops, agencies and service companies with
 * their own teams, run without phone calls.
 *
 *   dispatch   a job the partner holds with nobody on it goes to a member
 *              by the partner's rule: the nearest free member, or turns
 *              (the one given a job longest ago); manual leaves it to the owner
 *   capacity   the most jobs a partner runs at once; at it, ZappyOne offers
 *              it nothing new until one finishes
 *   team       members and team leads; a lead sees and assigns their group
 *   invite     a whole list of names and numbers at once
 *   insights   per member and per day: jobs, rating, value
 *
 * Assignment goes through jobs/assignment.assignTechnician, the same path as
 * the owner's own button, so every rule there still applies.
 */
const Shop = require('./shop.model');
const Worker = require('../worker/worker.model');
const { KINDS } = require('../jobs/kinds');
const { haversineKm } = require('../../core/geo/distance');
const logger = require('../../core/logger');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });

/** Per kind: the partner holds the job and nobody has set off yet. */
const WAITING_FOR_A_MEMBER = {
  repair: ['PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'PICKUP_SCHEDULED'],
  pet: ['PROVIDER_ASSIGNED', 'PROVIDER_ACCEPTED'],
};
/** Per kind: a job still open for the partner (counts towards capacity). */
const OPEN = {
  repair: ['PROVIDER_ASSIGNED', 'WORKER_ACCEPTED', 'PICKUP_SCHEDULED', 'ON_THE_WAY', 'ARRIVED', 'DIAGNOSING', 'QUOTE_PENDING', 'CUSTOMER_APPROVAL_PENDING', 'APPROVED', 'REPAIR_IN_PROGRESS'],
  pet: ['PROVIDER_ASSIGNED', 'PROVIDER_ACCEPTED', 'PROVIDER_EN_ROUTE', 'PROVIDER_ARRIVED', 'IN_PROGRESS'],
};

async function openJobs(shopId) {
  let n = 0;
  for (const [kind, statuses] of Object.entries(OPEN)) {
    n += await KINDS[kind].model().countDocuments({ shopId, status: { $in: statuses } });
  }
  return n;
}

/** Which of these partners are full (capacity reached): Set of id strings. */
async function atCapacity(shopIds = []) {
  if (!shopIds.length) return new Set();
  const shops = await Shop.find({ _id: { $in: shopIds }, 'dispatch.capacity': { $gt: 0 } }).select('dispatch').lean();
  const full = new Set();
  for (const s of shops) if (await openJobs(s._id) >= s.dispatch.capacity) full.add(String(s._id));
  return full;
}

/** The member a job should go to, by the partner's rule; null when nobody is free and on duty. */
async function pickMember(shop, kind, doc) {
  const members = await Worker.find({ shopId: shop._id, isBlocked: { $ne: true } }).select('currentLocation team').lean();
  if (!members.length) return null;
  const ids = members.map((m) => m._id);
  const [live, { free }] = await Promise.all([
    require('../worker/presence').liveIds(ids),
    require('../jobs/workload').classify(ids),
  ]);
  const ready = members.filter((m) => live.has(String(m._id)) && free.has(String(m._id)));
  if (!ready.length) return null;
  if (shop.dispatch?.mode === 'round_robin') {
    return ready.sort((a, b) => new Date(a.team?.lastAssignedAt || 0) - new Date(b.team?.lastAssignedAt || 0))[0];
  }
  const at = require('../jobs/kinds').whereOf(kind, doc);
  const km = (m) => (at && m.currentLocation?.coordinates?.length === 2 ? haversineKm(at.lat, at.lng, m.currentLocation.coordinates[1], m.currentLocation.coordinates[0]) : Infinity);
  return ready.sort((a, b) => km(a) - km(b))[0];
}

/**
 * Every few seconds: jobs partners hold with nobody on them, given to a member
 * by each partner's rule. Partners on manual are left alone.
 */
async function dispatchSweep() {
  const auto = await Shop.find({ 'dispatch.mode': { $in: ['nearest', 'round_robin'] } }).select('dispatch').lean();
  if (!auto.length) return { assigned: 0 };
  const byId = new Map(auto.map((s) => [String(s._id), s]));
  let assigned = 0;
  for (const [kind, statuses] of Object.entries(WAITING_FOR_A_MEMBER)) {
    const jobs = await KINDS[kind].model().find({ shopId: { $in: auto.map((s) => s._id) }, workerId: null, status: { $in: statuses } })
      .sort({ createdAt: 1 }).limit(100).lean();
    for (const job of jobs) {
      const shop = byId.get(String(job.shopId));
      try {
        const member = await pickMember(shop, kind, job);
        if (!member) continue;
        await require('../jobs/assignment').assignTechnician({ jobId: job._id, shopId: shop._id, workerId: member._id });
        await Worker.updateOne({ _id: member._id }, { $set: { 'team.lastAssignedAt': new Date() } });
        assigned += 1;
      } catch (e) {
        logger.warn({ err: e.message, kind, id: String(job._id) }, '[partner] dispatch failed');
      }
    }
  }
  return { assigned };
}

/** The partner's settings for its screens. */
async function settingsOf(shopId) {
  const shop = await Shop.findById(shopId).select('partnerType dispatch').lean();
  if (!shop) throw err(404, 'NOT_FOUND', 'Partner not found');
  return { partnerType: shop.partnerType || 'shop', dispatch: { mode: shop.dispatch?.mode || 'manual', capacity: shop.dispatch?.capacity || 0 }, openJobs: await openJobs(shopId) };
}

async function saveSettings(shopId, { partnerType, mode, capacity }) {
  const set = {};
  if (partnerType) set.partnerType = partnerType;
  if (mode) set['dispatch.mode'] = mode;
  if (capacity !== undefined) set['dispatch.capacity'] = capacity;
  await Shop.updateOne({ _id: shopId }, { $set: set });
  return settingsOf(shopId);
}

/** Add many members at once; each row is added as the single "Add" does, and reported. */
async function invite(shopId, rows) {
  const shopService = require('./shop.service');
  const out = [];
  for (const r of rows) {
    const phone = String(r.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(phone)) { out.push({ phone: r.phone, name: r.name || '', ok: false, error: 'Not a 10-digit mobile number' }); continue; }
    r.phone = phone;
    try {
      const { worker, isNew } = await shopService.addWorkerToShop(shopId, { phone: r.phone, name: r.name });
      out.push({ phone: r.phone, name: worker.name, ok: true, isNew });
    } catch (e) {
      out.push({ phone: r.phone, name: r.name || '', ok: false, error: e.message });
    }
  }
  return { added: out.filter((x) => x.ok).length, failed: out.filter((x) => !x.ok).length, rows: out };
}

/** Make a member a lead, or put a member under a lead (null takes them out of any group). */
async function setRole(shopId, workerId, { role, leadId }) {
  const w = await Worker.findOne({ _id: workerId, shopId });
  if (!w) throw err(404, 'NOT_FOUND', 'Not on your team');
  if (role) {
    w.team = { ...(w.team?.toObject?.() || w.team || {}), role };
    if (role === 'member') await Worker.updateMany({ shopId, 'team.leadId': w._id }, { $set: { 'team.leadId': null } });
  }
  if (leadId !== undefined) {
    if (leadId) {
      const lead = await Worker.findOne({ _id: leadId, shopId, 'team.role': 'lead' }).select('_id').lean();
      if (!lead) throw err(400, 'NOT_A_LEAD', 'Pick a team lead from your team');
      if (String(leadId) === String(workerId)) throw err(400, 'SELF', 'A lead cannot be in their own group');
    }
    w.set('team.leadId', leadId || null);
  }
  await w.save();
  return w.toObject();
}

/** A lead may assign a job of their partner to someone in their group (or themself). */
async function assertLeadMayAssign(leadId, workerId) {
  const lead = await Worker.findById(leadId).select('shopId team').lean();
  if (!lead?.shopId || lead.team?.role !== 'lead') throw err(403, 'NOT_A_LEAD', 'Only a team lead can assign jobs');
  if (String(workerId) === String(leadId)) return lead;
  const member = await Worker.findOne({ _id: workerId, shopId: lead.shopId, 'team.leadId': leadId }).select('_id').lean();
  if (!member) throw err(403, 'NOT_YOUR_GROUP', 'That person is not in your group');
  return lead;
}

/** A short line for a job on a lead's board, whatever its kind. */
function summaryOf(kind, d) {
  if (kind === 'repair') return { title: [d.brandCode, d.modelCode].filter(Boolean).join(' ').replace(/-/g, ' ') || 'Repair', where: d.location?.address || '' };
  return { title: (d.pets || []).map((p) => p.snapshot?.name).filter(Boolean).join(', ') || d.reference || 'Pet care', where: d.serviceLocation?.address || '' };
}

/**
 * A team lead's board: the people in their group (and themself), the jobs
 * they are on, and the partner's jobs nobody is on yet, which the lead may give out.
 */
async function leadBoard(leadId) {
  const lead = await Worker.findById(leadId).select('shopId team name phone isOnline').lean();
  if (!lead?.shopId || lead.team?.role !== 'lead') throw err(403, 'NOT_A_LEAD', 'Only a team lead has a team board');
  const group = await Worker.find({ shopId: lead.shopId, 'team.leadId': lead._id, isBlocked: { $ne: true } }).select('name phone isOnline').lean();
  const people = [lead, ...group];
  const ids = people.map((p) => p._id);
  const jobs = [];
  for (const [kind, statuses] of Object.entries(OPEN)) {
    const rows = await KINDS[kind].model().find({
      shopId: lead.shopId, status: { $in: statuses },
      $or: [{ workerId: { $in: ids } }, { workerId: null, status: { $in: WAITING_FOR_A_MEMBER[kind] } }],
    }).sort({ createdAt: 1 }).limit(100).lean();
    for (const d of rows) jobs.push({ kind, id: String(d._id), status: d.status, workerId: d.workerId ? String(d.workerId) : null, at: d.scheduledAt || d.createdAt, ...summaryOf(kind, d) });
  }
  return {
    members: people.map((p) => ({ id: String(p._id), name: p.name || p.phone, isOnline: !!p.isOnline, lead: String(p._id) === String(lead._id) })),
    jobs,
  };
}

/**
 * The partner's numbers over `days`: per member (jobs done, rating, value of
 * jobs) and per day, from the jobs themselves.
 */
async function insights(shopId, days = 30) {
  const since = new Date(Date.now() - Math.min(90, Math.max(7, days)) * 86400000);
  const members = await Worker.find({ shopId }).select('name phone rating team').lean();
  const per = new Map(members.map((m) => [String(m._id), { id: String(m._id), name: m.name || m.phone, role: m.team?.role || 'member', rating: m.rating ?? null, jobs: 0, valuePaise: 0 }]));
  const perDay = new Map();
  for (const kind of Object.keys(OPEN)) {
    const k = KINDS[kind];
    if (!k.earning) continue;
    const rows = await k.model().find({ shopId, status: { $in: k.earning.done }, [k.earning.at]: { $gte: since } }).select(`${k.earning.fields} workerId`).lean();
    for (const r of rows) {
      const value = k.earning.gross ? k.earning.gross(r) : k.earning.share(r);
      const day = new Date(new Date(k.earning.at.split('.').reduce((v, p) => v?.[p], r)).getTime() + 330 * 60000).toISOString().slice(0, 10);
      const d = perDay.get(day) || { date: day, jobs: 0, valuePaise: 0 };
      d.jobs += 1; d.valuePaise += value; perDay.set(day, d);
      const m = per.get(String(r.workerId));
      if (m) { m.jobs += 1; m.valuePaise += value; }
    }
  }
  const daysList = [];
  for (let t = since.getTime(); t <= Date.now(); t += 86400000) {
    const key = new Date(t + 330 * 60000).toISOString().slice(0, 10);
    daysList.push(perDay.get(key) || { date: key, jobs: 0, valuePaise: 0 });
  }
  const list = [...per.values()].sort((a, b) => b.jobs - a.jobs);
  return {
    members: list, days: daysList,
    totals: { jobs: daysList.reduce((t, d) => t + d.jobs, 0), valuePaise: daysList.reduce((t, d) => t + d.valuePaise, 0), team: members.length, leads: members.filter((m) => m.team?.role === 'lead').length },
    open: await openJobs(shopId),
  };
}

module.exports = { dispatchSweep, pickMember, atCapacity, openJobs, settingsOf, saveSettings, invite, setRole, assertLeadMayAssign, leadBoard, insights };
