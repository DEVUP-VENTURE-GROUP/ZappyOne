/**
 * Invoice Service
 *
 * Renders a clean HTML invoice for a completed order. Why HTML and not direct
 * PDF generation here?
 *   - HTML is instantly viewable in browser & easy to print
 *   - PDF generation (Puppeteer/headless Chrome) is heavy and best done in a
 *     dedicated worker; we keep that as a future plug-in point
 *   - Same template can be rendered server-side to PDF when needed
 *
 * Invoices are deterministic — same order → same invoice content. We don't
 * persist the rendered HTML; we generate on demand.
 *
 * Invoice number format: INV-YYYYMM-<orderId-suffix> for human readability.
 */

const Order = require('../order/order.model');
const User = require('../user/user.model');
const Worker = require('../worker/worker.model');

// The business on the invoice comes from Admin → Messages → Business details; no GSTIN there means no GST lines.
async function company() {
  const s = await require('../messaging/settings').get();
  return { name: s.brandName || 'ZappyOne', legalName: s.legalName || '', addressLines: s.address ? [s.address] : [], gstin: s.gstin || '', email: s.supportEmail || 'support@zappyone.com' };
}
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

const TAX_RATE = 0.18; // GST 18% — applied on platform fee + commission only

function invoiceNumber(order) {
  const dt = order.completedAt || order.createdAt;
  const ym = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return `INV-${ym}-${String(order._id).slice(-8).toUpperCase()}`;
}

async function getInvoiceData(orderId) {
  const order = await Order.findById(orderId).lean();
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (order.status !== 'completed') {
    throw Object.assign(new Error('Invoice available only for completed orders'), {
      status: 400, code: 'ORDER_NOT_COMPLETED',
    });
  }

  const [user, worker] = await Promise.all([
    User.findById(order.userId).lean(),
    order.workerId ? Worker.findById(order.workerId).lean() : null,
  ]);

  const p = order.pricing || {};
  const total = num(p.totalPaise) != null ? p.totalPaise / 100 : (num(p.total) ?? 0);
  const co = await company();
  const platformFee = num(p.platformFee) || 0;
  const tax = co.gstin ? Math.round(platformFee * TAX_RATE) : 0;
  // Only the lines this booking really has; whatever else made up the total is shown as one line, so the bill always adds up.
  const lines = [
    ['Service', num(p.baseFee)],
    [num(p.distanceKm) != null ? `Distance (${p.distanceKm} km)` : 'Distance', num(p.distanceFee)],
    [num(p.etaMinutes) != null ? `Time (about ${p.etaMinutes} min)` : 'Time', num(p.timeFee)],
    ['Platform fee', platformFee || null],
    ['Tip', num(p.tipPaise) ? p.tipPaise / 100 : null],
    ['Discount', num(p.discountPaise) ? -p.discountPaise / 100 : null],
  ].filter(([, a]) => a != null && a !== 0).map(([label, amount]) => ({ label, amount }));
  const known = lines.reduce((t, l) => t + l.amount, 0) + tax;
  const rest = Math.round((total - known) * 100) / 100;
  if (Math.abs(rest) >= 1) lines.push({ label: lines.length ? 'Other charges' : 'Service', amount: rest });
  const subtotal = Math.round((total - tax) * 100) / 100;

  return {
    invoiceNumber: invoiceNumber(order),
    invoiceDate: order.completedAt || order.createdAt,
    company: co,
    customer: {
      name: user?.name || '-',
      phone: user?.phone || '-',
      email: user?.email || '-',
      address: order.pickupLocation.address,
    },
    worker: worker ? {
      name: worker.name,
      phone: worker.phone,
      rating: worker.rating,
    } : null,
    order: {
      id: String(order._id),
      service: order.service,
      description: order.description,
      bookedAt: order.createdAt,
      completedAt: order.completedAt,
      paymentMethod: order.payment?.method || 'unknown',
      paymentStatus: order.payment?.status || 'unknown',
    },
    lineItems: lines,
    subtotal,
    tax,
    taxRate: TAX_RATE,
    total,
    currency: 'INR',
  };
}

function renderHtml(data) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>Invoice ${data.invoiceNumber}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #1e293b; max-width: 800px; margin: 40px auto; padding: 40px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #0284c7; }
  .head h1 { color: #0284c7; margin: 0 0 4px 0; font-size: 28px; }
  .head .invn { color: #64748b; font-size: 13px; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  .meta-grid h3 { color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px 0; font-weight: 600; }
  .meta-grid p { margin: 2px 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  th { text-align: left; background: #f8fafc; padding: 12px; font-size: 12px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #e2e8f0; }
  td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  td.right { text-align: right; }
  .totals { margin-left: auto; width: 320px; margin-top: 16px; }
  .totals .row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
  .totals .grand { border-top: 2px solid #0284c7; margin-top: 8px; padding-top: 12px; font-weight: 700; font-size: 18px; color: #0284c7; }
  .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; text-align: center; }
  .badge { display: inline-block; background: #dcfce7; color: #166534; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <h1>${escape(data.company.name)}</h1>
      ${data.company.legalName ? `<div style="font-size:13px;color:#64748b">A venture of ${escape(data.company.legalName)}</div>` : ''}
      ${data.company.addressLines.map((l) => `<div style="font-size:13px;color:#64748b">${escape(l)}</div>`).join('')}
      ${data.company.gstin ? `<div style="font-size:13px;color:#64748b">GSTIN: ${escape(data.company.gstin)}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em">${data.company.gstin && data.tax > 0 ? 'Tax invoice' : 'Receipt'}</div>
      <div class="invn">${escape(data.invoiceNumber)}</div>
      <div style="font-size:13px;color:#64748b;margin-top:8px">${formatDate(data.invoiceDate)}</div>
      <div style="margin-top:12px"><span class="badge">PAID</span></div>
    </div>
  </div>

  <div class="meta-grid">
    <div>
      <h3>Billed to</h3>
      <p><strong>${escape(data.customer.name)}</strong></p>
      <p>${escape(data.customer.phone)}</p>
      <p>${escape(data.customer.address)}</p>
    </div>
    <div>
      <h3>Service details</h3>
      <p><strong>${escape(data.order.service.replace(/_/g, ' '))}</strong></p>
      ${data.worker ? `<p>Performed by: ${escape(data.worker.name)}</p>` : ''}
      <p>Completed: ${formatDate(data.order.completedAt)}</p>
      <p>Order #: ${escape(data.order.id.slice(-12))}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Description</th><th class="right">Amount</th></tr>
    </thead>
    <tbody>
      ${data.lineItems.map((li) => `
        <tr>
          <td>${escape(li.label)}</td>
          <td class="right">${money(li.amount)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    ${data.tax > 0 ? `<div class="row"><span>Subtotal</span><span>${money(data.subtotal)}</span></div>
    <div class="row"><span>GST (${(data.taxRate * 100).toFixed(0)}% on platform fee)</span><span>${money(data.tax)}</span></div>` : ''}
    <div class="row grand"><span>Total</span><span>${money(data.total)}</span></div>
  </div>

  <div class="footer">
    Thank you for choosing ${escape(data.company.name)}. For questions, email ${escape(data.company.email)}<br>
    This is a computer-generated ${data.company.gstin && data.tax > 0 ? 'invoice' : 'receipt'} and does not require a signature.
  </div>
</body></html>`;
}

function money(v) {
  const n = Number(v) || 0;
  return `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function escape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

module.exports = { getInvoiceData, renderHtml, invoiceNumber };
