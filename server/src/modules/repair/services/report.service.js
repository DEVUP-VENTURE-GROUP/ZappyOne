/**
 * The service report a customer receives after a completed repair job.
 *
 * WHY THIS IS NOT THE INVOICE. The invoice answers "what did I pay?". This
 * answers "what did you actually find, and what did you do about it?" — the
 * tank was opened, someone looked inside, and that finding is the thing the
 * customer cannot see for themselves and is really buying. For an inspection
 * it IS the deliverable: §8 promises findings first, with no obligation to
 * buy a repair, and a report is how that promise is kept.
 *
 * Built on the same rendered-HTML approach as the order invoice rather than a
 * new PDF dependency: the browser prints or saves it, the mail client renders
 * it, and it stays greppable in support. `invoice.service` proved the pattern.
 *
 * NOTHING IS INVENTED HERE. Every field is read off the booking. Where a
 * technician recorded nothing, the report says so plainly instead of leaving a
 * confident-looking blank — an empty checklist row is materially different
 * from a row that passed, and a report that blurs the two is worse than none.
 */

const { RepairBooking } = require('../models/booking.model');
const { Repair } = require('../models/repair.model');
const { DeviceInspection, QAInspection } = require('../models/custody.model');
const Brand = require('../../service/brand.model');
const DeviceModel = require('../../service/device-model.model');
const Worker = require('../../worker/worker.model');
const Shop = require('../../shop/shop.model');
const s3Service = require('../../../core/storage/s3');

const rupees = (paise) => `₹${((paise || 0) / 100).toLocaleString('en-IN')}`;

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Assemble everything the report shows.
 *
 * Photos are signed here, not in the template: the bucket is private, and an
 * unsigned key renders as a broken image — which on a before/after report
 * reads as "they did not photograph it".
 */
async function getReportData(bookingId) {
  const booking = await RepairBooking.findById(bookingId).lean();
  if (!booking) return null;

  const [repair, brand, model, worker, shop] = await Promise.all([
    booking.repairCode
      ? Repair.findOne({ code: booking.repairCode, vertical: booking.vertical }).lean()
      : null,
    booking.brandCode
      ? Brand.findOne({ code: booking.brandCode, category: booking.vertical }).lean()
      : null,
    booking.modelCode
      ? DeviceModel.findOne({ code: booking.modelCode }).lean()
      : null,
    booking.workerId ? Worker.findById(booking.workerId).select('name phone').lean() : null,
    booking.shopId ? Shop.findById(booking.shopId).select('name phone address').lean() : null,
  ]);

  /*
   * The QA record is the real source of what was checked — it carries the
   * technician's per-item result, not a boolean on the booking. The 'after'
   * stage is the one that gates completion, so that is the one reported.
   */
  const qa = await QAInspection.findOne({ bookingId: booking._id, stage: 'after' })
    .sort({ performedAt: -1 }).lean();

  /*
   * "Before" photos come from the arrival inspection, not from the booking:
   * what the customer uploaded when booking is what they THINK is wrong; what
   * the technician photographed on arrival is the tank's actual condition, and
   * that is the honest comparison against the after photos.
   */
  const beforeInspection = await DeviceInspection.findOne({
    bookingId: booking._id, stage: { $in: ['check_in', 'pre_repair'] },
  }).sort({ performedAt: 1 }).lean();

  const beforeKeys = (beforeInspection?.photos || []).map((p) => p.url);
  const afterKeys = [
    ...(booking.completionPhotos || []),
    ...(qa?.photos || []).map((p) => p.url),
  ];

  // Private bucket: unsigned keys render as broken images, which on a
  // before/after report reads as "they never photographed it".
  const signed = await s3Service.signDocMedia({
    beforePhotos: beforeKeys,
    afterPhotos: [...new Set(afterKeys)],
  });

  return {
    booking,
    repair,
    brandName: brand?.name || booking.brandCode || '—',
    modelName: model?.name || booking.modelCode || '—',
    provider: shop?.name || worker?.name || 'Assigned technician',
    providerPhone: shop?.phone || worker?.phone || '',
    qaResults: qa?.results || [],
    qaPassed: qa?.passed ?? null,
    beforePhotos: signed.beforePhotos || [],
    afterPhotos: signed.afterPhotos || [],
    generatedAt: new Date(),
  };
}

function section(title, body) {
  return `<div class="sec"><h3>${escape(title)}</h3>${body}</div>`;
}

/**
 * A row that says "not tested" rather than pretending it passed.
 *
 * `not_tested` is a real, distinct state in the QA schema and it must survive
 * into the report — a customer reading a page of ticks when half of them were
 * never checked has been misled, and the whole point of the report is that it
 * is trustworthy.
 */
const QA_STATE = {
  pass: '<span class="ok">Done</span>',
  fail: '<span class="bad">Failed</span>',
  not_applicable: '<span class="muted">Not applicable</span>',
  not_tested: '<span class="unk">Not recorded</span>',
};

function checklistRows(results) {
  if (!results.length) return '<p class="muted">No checklist was recorded for this service.</p>';
  const rows = results.map((r) => {
    const state = QA_STATE[r.result] || QA_STATE.not_tested;
    const note = r.note ? `<div class="muted" style="margin-top:2px">${escape(r.note)}</div>` : '';
    return `<tr><td>${escape(r.label)}${note}</td><td class="right">${state}</td></tr>`;
  });
  return `<table><tbody>${rows.join('')}</tbody></table>`;
}

function photoGrid(photos, emptyText) {
  if (!photos.length) return `<p class="muted">${escape(emptyText)}</p>`;
  return `<div class="photos">${photos
    .map((p) => `<img src="${escape(p)}" alt="" />`)
    .join('')}</div>`;
}

function renderHtml(data) {
  const { booking, repair } = data;
  const price = booking.priceSnapshot || {};

  const addOnRows = (booking.addOns || []).length
    ? (booking.addOns || []).map((a) => (
      `<tr><td>${escape(a.name || a.repairCode)}</td><td class="right">${rupees(a.totalPaise)}</td></tr>`
    )).join('')
    : '';

  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Service report ${escape(booking.reference)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #1e293b; max-width: 800px; margin: 40px auto; padding: 40px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #0284c7; }
  .head h1 { color: #0284c7; margin: 0; font-size: 26px; }
  .head .ref { color: #64748b; font-size: 13px; margin-top: 4px; }
  .sec { margin: 28px 0; }
  .sec h3 { color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 10px 0; font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid p { margin: 2px 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  td.right { text-align: right; }
  .ok { color: #166534; font-weight: 600; }
  .bad { color: #b91c1c; font-weight: 600; }
  .unk { color: #92400e; font-weight: 600; }
  .muted { color: #64748b; font-size: 13px; font-style: italic; }
  .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .photos img { width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; }
  .totals { margin-left: auto; width: 320px; }
  .totals .row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 14px; }
  .totals .grand { border-top: 2px solid #0284c7; margin-top: 6px; padding-top: 10px; font-weight: 700; font-size: 17px; color: #0284c7; }
  .note { background: #f0f9ff; border-left: 3px solid #0284c7; padding: 12px 14px; font-size: 13px; color: #075985; border-radius: 0 6px 6px 0; }
  .footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; text-align: center; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>Service report</h1>
      <div class="ref">${escape(booking.reference)}</div>
    </div>
    <div style="text-align:right;font-size:13px;color:#64748b">
      <div>${escape(formatDate(booking.completedAt || booking.updatedAt))}</div>
      <div style="margin-top:4px">${escape(booking.status)}</div>
    </div>
  </div>

  ${section('What was serviced', `
    <div class="grid">
      <div>
        <p><strong>${escape(data.brandName)}</strong></p>
        <p>${escape(data.modelName)}</p>
      </div>
      <div>
        <p><strong>${escape(repair?.name || 'Service')}</strong></p>
        <p>${escape(booking.serviceMode)}</p>
      </div>
    </div>
  `)}

  ${booking.diagnosisSummary ? section('What the technician found', `
    <p style="font-size:14px;white-space:pre-wrap">${escape(booking.diagnosisSummary)}</p>
  `) : ''}

  ${section('Work completed', checklistRows(data.qaResults))}

  ${section('Before', photoGrid(data.beforePhotos, 'No before photos were recorded for this job.'))}
  ${section('After', photoGrid(data.afterPhotos, 'No after photos were recorded for this job.'))}

  ${section('What you paid', `
    <table><tbody>
      <tr><td>${escape(repair?.name || 'Service')}</td><td class="right">${rupees((price.subtotalPaise || 0) - (booking.addOns || []).reduce((s, a) => s + (a.totalPaise || 0), 0))}</td></tr>
      ${addOnRows}
      ${price.platformFeePaise ? `<tr><td>Platform fee</td><td class="right">${rupees(price.platformFeePaise)}</td></tr>` : ''}
      ${price.taxPaise ? `<tr><td>Tax</td><td class="right">${rupees(price.taxPaise)}</td></tr>` : ''}
      ${price.discountPaise ? `<tr><td>Discount</td><td class="right">−${rupees(price.discountPaise)}</td></tr>` : ''}
    </tbody></table>
    <div class="totals">
      <div class="row grand"><span>Total</span><span>${rupees(price.totalPaise)}</span></div>
    </div>
  `)}

  ${price.warrantyDays ? section('Warranty', `
    <div class="note">This work is covered for ${price.warrantyDays} days from ${escape(formatDate(booking.completedAt || booking.updatedAt))}. Keep this report — it is your proof of service.</div>
  `) : ''}

  ${section('Who did the work', `
    <p style="font-size:14px"><strong>${escape(data.provider)}</strong></p>
    ${data.providerPhone ? `<p style="font-size:14px;color:#64748b">${escape(data.providerPhone)}</p>` : ''}
  `)}

  <div class="footer">
    Generated ${escape(formatDate(data.generatedAt))} · ZappyOne
  </div>
</body></html>`;
}

module.exports = { getReportData, renderHtml };
