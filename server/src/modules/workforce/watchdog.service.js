/**
 * The fleet looking after itself (every few minutes, with the shift sweep):
 *
 *   reminder   30 minutes before a booked shift, the staff member is told where to check in
 *   no-show    once a shift is past its grace minutes with no check-in, they are told to check in
 *   attention  what a person must act on now (Fleet → Overview), and the same as a
 *              morning email to ops at 8 am: shifts short today and tomorrow, yesterday's
 *              no-shows, cash held over a day, low stock, leave waiting
 *   auto-fill  fill a hub's empty places for the coming days with staff who are free that
 *              day (not already on a shift, not on leave), fewest shifts that week first
 *
 * Every message is sent once (messaging/send refId).
 */
const Hub = require('./hub.model');
const Shift = require('./shift.model');
const Leave = require('./leave.model');
const Worker = require('../worker/worker.model');
const shiftsService = require('./shifts.service');

const send = (key, opts) => require('../messaging/send').send(key, opts).catch(() => {});
const time = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const istDay = shiftsService.istDay;
const DAY = 86400000;

async function remindAndChase(now = new Date()) {
  const cfg = await require('../pricing/services/config.service').workforceSettings();
  const soon = await Shift.find({ status: 'booked', startAt: { $gt: new Date(now.getTime() + 25 * 60000), $lte: new Date(now.getTime() + 35 * 60000) } }).populate('hubId', 'name meetingPoint').lean();
  for (const s of soon) {
    send('staff.shift_reminder', { to: { kind: 'worker', id: s.workerId }, refId: `shift:${s._id}:remind`, ctx: { shift: s.label, start: time(s.startAt), hub: s.hubId?.name || 'your hub', place: s.hubId?.meetingPoint?.address || '' } });
  }
  const late = await Shift.find({ status: 'booked', startAt: { $lte: new Date(now.getTime() - cfg.lateGraceMin * 60000) }, endAt: { $gt: now } }).populate('hubId', 'name').lean();
  for (const s of late) {
    send('staff.no_show', { to: { kind: 'worker', id: s.workerId }, refId: `shift:${s._id}:noshow`, ctx: { shift: s.label, start: time(s.startAt), hub: s.hubId?.name || 'your hub' } });
  }
  return { reminded: soon.length, chased: late.length };
}

/** What needs a person now. */
async function attention(now = new Date()) {
  const today = istDay(now); const tomorrow = istDay(now.getTime() + DAY); const yesterday = istDay(now.getTime() - DAY);
  const [hubs, noShows, staff, lowStock, leave] = await Promise.all([
    Hub.find({ isActive: true }).select('name').lean(),
    Shift.find({ day: yesterday, status: 'missed' }).populate('workerId', 'name').populate('hubId', 'name').lean(),
    Worker.find({ 'employment.type': 'staff' }).select('name').lean(),
    require('./stock.service').items().then((items) => items.filter((i) => i.low)),
    Leave.countDocuments({ status: 'requested' }),
  ]);
  const short = [];
  for (const h of hubs) {
    const r = await shiftsService.roster({ hubId: h._id, from: today, days: 2 });
    r.days.forEach((d) => d.shifts.forEach((s) => { if (s.short) short.push({ hub: h.name, hubId: String(h._id), day: d.day, shift: s.label, short: s.short, when: d.day === today ? 'today' : 'tomorrow' }); }));
  }
  // Cash still with someone whose last shift ended over a day ago.
  const Wallet = require('../wallet/wallet.model');
  const owing = await Wallet.find({ 'owner.kind': 'worker', 'owner.id': { $in: staff.map((w) => w._id) }, balancePaise: { $lt: 0 } }).select('owner balancePaise').lean();
  const cash = [];
  for (const w of owing) {
    const last = await Shift.findOne({ workerId: w.owner.id, status: { $in: ['done', 'checked_in'] } }).sort({ endAt: -1 }).select('endAt status').lean();
    if (last && last.status === 'done' && now - new Date(last.endAt) > DAY) {
      cash.push({ workerId: String(w.owner.id), name: staff.find((s) => String(s._id) === String(w.owner.id))?.name || 'Staff', paise: -w.balancePaise });
    }
  }
  return {
    short,
    noShows: noShows.map((s) => ({ name: s.workerId?.name || 'Staff', hub: s.hubId?.name || '', shift: s.label })),
    cash,
    lowStock: lowStock.map((i) => ({ name: i.name, hub: i.hubId?.name || '', qty: i.qty, unit: i.unit })),
    leave,
  };
}

/** 8 am India time, once a day: the fleet's morning email to ops. */
async function morningEmail(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60000);
  if (ist.getUTCHours() !== 8) return false;
  const a = await attention(now);
  const r = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
  await send('ops.fleet_daily', {
    to: 'ops', refId: `fleet:daily:${istDay(now)}`,
    ctx: {
      day: ist.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
      short: a.short.map((s) => `${s.hub} ${s.shift} ${s.when}: ${s.short} short`),
      noShows: a.noShows.map((s) => `${s.name}, ${s.hub} ${s.shift}`),
      cash: a.cash.map((c) => `${c.name}: ${r(c.paise)}`),
      lowStock: a.lowStock.map((i) => `${i.name} at ${i.hub}: ${i.qty} left`),
      leave: a.leave,
    },
  });
  return true;
}

/**
 * Fill a hub's empty places for the coming days: staff of that hub who are
 * free that day, those with the fewest shifts in the span first.
 */
async function autoFill({ hubId, days = 7 }) {
  const r = await shiftsService.roster({ hubId, days });
  const people = await Worker.find({ 'employment.type': 'staff', 'employment.hubId': hubId }).select('_id').lean();
  const dayList = r.days.map((d) => d.day);
  const [leave, booked] = await Promise.all([
    Leave.find({ workerId: { $in: people.map((p) => p._id) }, day: { $in: dayList }, status: { $in: ['approved', 'requested'] } }).select('workerId day').lean(),
    Shift.find({ workerId: { $in: people.map((p) => p._id) }, day: { $in: dayList }, status: { $ne: 'cancelled' } }).select('workerId day').lean(),
  ]);
  const off = new Set(leave.map((l) => `${l.workerId}:${l.day}`));
  const busy = new Set(booked.map((b) => `${b.workerId}:${b.day}`));
  const load = new Map(people.map((p) => [String(p._id), booked.filter((b) => String(b.workerId) === String(p._id)).length]));
  let filled = 0;
  for (const d of r.days) {
    for (const s of d.shifts) {
      for (let i = 0; i < s.short; i += 1) {
        const pick = [...load.entries()].filter(([id]) => !off.has(`${id}:${d.day}`) && !busy.has(`${id}:${d.day}`)).sort((a, b) => a[1] - b[1])[0];
        if (!pick) break;
        try {
          await shiftsService.book({ workerId: pick[0], day: d.day, code: s.code, by: 'admin' });
          busy.add(`${pick[0]}:${d.day}`); load.set(pick[0], pick[1] + 1); filled += 1;
        } catch { busy.add(`${pick[0]}:${d.day}`); }
      }
    }
  }
  return { filled };
}

async function tick(now = new Date()) {
  const out = await remindAndChase(now);
  await morningEmail(now).catch(() => {});
  return out;
}

module.exports = { tick, remindAndChase, attention, morningEmail, autoFill };
