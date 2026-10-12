/**
 * What finished jobs paid a provider, for every kind in jobs/kinds.js.
 *
 * Each kind says when a job counts as done and what the provider's share was —
 * for a repair that is the settlement run's own split — so a technician's
 * screen, a shop's screen and the actual payout read the same numbers.
 */
const { ALL } = require('./kinds');
const { istDayStart } = require('../../core/time/ist');

const dotted = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);

/** Start of a reporting window; "today" is India's day, not the server's. */
function rangeStart(range = 'today') {
  if (range === 'today') return istDayStart();
  return new Date(Date.now() - (range === 'week' ? 7 : 30) * 86400 * 1000);
}

/**
 * Every job matching `match` (e.g. { workerId } or a shop's $or) finished
 * since `since`, as { kind, paise, platformPaise, cash, at }.
 */
async function finishedJobs(match, since) {
  const finished = [];
  for (const k of ALL.filter((x) => x.earning)) {
    const rows = await k.model().find({
      ...match, status: { $in: k.earning.done }, [k.earning.at]: { $gte: since },
    }).select(k.earning.fields).lean();
    for (const r of rows) {
      const paise = k.earning.share(r);
      const gross = k.earning.gross ? k.earning.gross(r) : paise;
      finished.push({
        kind: k.kind, id: String(r._id), reference: r.reference || null, label: k.earning.label ? k.earning.label(r) : k.label,
        paise, gross, boostPaise: r.boost?.paise || 0, tipPaise: r.tip?.paise || 0, tipMethod: r.tip?.method || null,
        // Their share of the surge (jobs/surge), inside `paise`.
        surgePaise: require('./surge').providerSurgePaise(r),
        surgeHeldPaise: require('./surge').heldSurgePaise(r),
        platformPaise: k.earning.platform ? k.earning.platform(r) : Math.max(0, gross + (r.boost?.paise || 0) + (r.surge?.paise || 0) - paise),
        cash: r.paymentMethod === 'cash', at: dotted(r, k.earning.at),
      });
    }
  }
  return finished;
}

/**
 * One job's money as its provider sees it: what the customer paid, line by
 * line; what ZappyOne keeps; what is theirs; and how it settles (cash: they
 * hold it all and ZappyOne's part comes off their wallet; online: their part
 * goes to their wallet). Same parts as finishedJobs, so it matches Earnings.
 */
async function forJob(kind, id) {
  const { KINDS } = require('./kinds');
  const k = KINDS[kind];
  if (!k?.earning?.bill) return null;
  const doc = await k.model().findById(id)
    .select(`${k.earning.fields} status workerId shopId carriedFee priceSnapshot pricing charge`).lean();
  if (!doc) return null;

  const b = k.earning.bill(doc);
  const surgePaise = doc.surge?.paise || 0;
  const surgeYoursPaise = require('./surge').providerSurgePaise(doc);
  const surgeHeldPaise = require('./surge').heldSurgePaise(doc);
  const boostPaise = doc.boost?.paise || 0;
  const tipPaise = doc.tip?.paise || 0;
  const tipOnBill = doc.tip?.method === 'with_payment' ? tipPaise : 0;
  const carriedPaise = doc.carriedFee?.paise > 0 ? doc.carriedFee.paise : 0;
  const discountPaise = Math.max(0, b.servicePaise + b.platformFeePaise + b.taxPaise - b.creditPaise - b.totalPaise);

  const customerPaidPaise = b.totalPaise + surgePaise + boostPaise + tipOnBill + carriedPaise;
  const youEarnPaise = b.providerPaise + boostPaise + surgeYoursPaise + tipPaise;
  const line = (label, paise, note) => (paise ? [{ label, paise, ...(note && { note }) }] : []);
  const pct = b.servicePaise > 0 ? Math.round((b.commissionPaise / b.servicePaise) * 100) : 0;

  return {
    kind, reference: doc.reference || null, status: doc.status,
    done: k.earning.done.includes(doc.status), cash: doc.paymentMethod === 'cash',
    customerPaidPaise,
    bill: [
      ...line('Service', b.servicePaise),
      ...line('Platform fee', b.platformFeePaise),
      ...line('GST', b.taxPaise),
      ...line('Discount', -discountPaise),
      ...line('Inspection already paid', -b.creditPaise),
      ...line((doc.surge?.lines?.length === 1 && doc.surge.lines[0].label) || 'Surge fee', surgePaise),
      ...line('Priority boost', boostPaise),
      ...line('Tip', tipOnBill),
      ...line('Earlier cancellation fee', carriedPaise),
    ],
    zappy: [
      ...line(`Commission${pct ? ` (${pct}%)` : ''}`, b.commissionPaise),
      ...line('Platform fee', b.platformFeePaise),
      ...line('GST', b.taxPaise),
      ...line('ZappyOne share of the surge fee', surgePaise - surgeYoursPaise - surgeHeldPaise),
      ...line('Your surge share, held for review', surgeHeldPaise, 'paid to you if the review clears it'),
      ...line('Earlier cancellation fee', carriedPaise, 'owed by the customer from a cancelled booking'),
    ],
    zappyKeepsPaise: Math.max(0, customerPaidPaise - (youEarnPaise - (tipPaise - tipOnBill))),
    youEarnPaise,
    yours: [
      ...line('Your share of the service', b.providerPaise),
      ...line('Your share of the surge fee', surgeYoursPaise),
      ...line('Priority boost', boostPaise),
      ...line('Tip', tipPaise),
    ],
  };
}

module.exports = { rangeStart, finishedJobs, forJob };
