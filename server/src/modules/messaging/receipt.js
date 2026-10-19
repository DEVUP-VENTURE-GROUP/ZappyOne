/**
 * The receipt a customer gets when a job is done, as a PDF: attached to the
 * "job done" email and downloadable from the booking.
 *
 * Read entirely off the booking (messaging/facts), so the PDF, the email and
 * the screen show the same lines. It is a "Tax invoice" only when GST was
 * actually charged on it and a GSTIN is set (Admin → Messages → Business
 * details); otherwise it is a receipt, with the GSTIN shown for reference.
 * Poppins is bundled because the PDF standard fonts have no ₹ sign.
 */
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { jobFacts, rupees } = require('./facts');

const FONT = path.join(__dirname, 'fonts', 'Poppins-Regular.ttf');
const BOLD = path.join(__dirname, 'fonts', 'Poppins-SemiBold.ttf');
const LOGO = path.join(__dirname, '..', '..', '..', '..', 'assets', 'web', 'logo.png');
const BRAND = '#1F4FD8';
const INK = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';

/** Same booking, same number, every time. */
const receiptNumber = (f, doc) => {
  const d = new Date(doc.completedAt || doc.execution?.completedAt || doc.updatedAt || Date.now());
  const ym = d.toLocaleDateString('en-IN', { year: '2-digit', month: '2-digit', timeZone: 'Asia/Kolkata' }).split('/').reverse().join('');
  return `ZO-${ym}-${f.reference}`;
};

async function build(kind, doc) {
  const s = await require('./settings').get();
  const f = await jobFacts(kind, doc);
  const taxPaise = (f.linesPaise.find(([l]) => l === 'Taxes') || [0, 0])[1];
  const isTaxInvoice = !!s.gstin && taxPaise > 0;
  const number = receiptNumber(f, doc);
  const issuedOn = new Date(doc.completedAt || doc.execution?.completedAt || Date.now())
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

  const customer = doc.userId ? await require('../user/user.model').findById(doc.userId).select('name phone email').lean() : null;

  const pdf = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${s.brandName} ${isTaxInvoice ? 'tax invoice' : 'receipt'} ${number}`, Author: s.legalName || s.brandName } });
  pdf.registerFont('r', FONT);
  pdf.registerFont('b', BOLD);
  const chunks = [];
  pdf.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => pdf.on('end', resolve));

  const W = pdf.page.width - 96;
  const X = 48;

  // Header: logo + name, and what this document is.
  pdf.rect(0, 0, pdf.page.width, 6).fill(BRAND);
  if (fs.existsSync(LOGO)) pdf.image(LOGO, X, 34, { width: 40, height: 40 });
  pdf.fillColor(INK).font('b').fontSize(18).text(s.brandName, X + 50, 42);
  pdf.font('r').fontSize(8.5).fillColor(MUTED).text(s.legalName ? `A venture of ${s.legalName}` : '', X + 50, 64);
  pdf.font('b').fontSize(16).fillColor(INK).text(isTaxInvoice ? 'Tax invoice' : 'Receipt', X, 40, { width: W, align: 'right' });
  pdf.font('r').fontSize(9).fillColor(MUTED)
    .text(`No. ${number}`, X, 62, { width: W, align: 'right' })
    .text(`Date ${issuedOn}`, X, 75, { width: W, align: 'right' });

  // Who and what.
  let y = 112;
  const col = (title, lines, x, w) => {
    pdf.font('b').fontSize(8.5).fillColor(MUTED).text(title.toUpperCase(), x, y, { width: w, characterSpacing: 0.6 });
    pdf.font('r').fontSize(10).fillColor(INK).text(lines.filter(Boolean).join('\n'), x, y + 14, { width: w, lineGap: 2 });
  };
  col('Billed to', [customer?.name || 'Customer', customer?.phone, f.address], X, W / 2 - 12);
  col('Issued by', [s.legalName || s.brandName, s.address, s.gstin ? `GSTIN ${s.gstin}` : null, s.supportEmail], X + W / 2 + 12, W / 2 - 12);
  y += 92;

  pdf.moveTo(X, y).lineTo(X + W, y).strokeColor(LINE).lineWidth(1).stroke();
  y += 14;
  const detail = (label, value) => {
    if (!value) return;
    pdf.font('r').fontSize(10).fillColor(MUTED).text(label, X, y, { width: 140 });
    pdf.fillColor(INK).text(value, X + 140, y, { width: W - 140 });
    y = pdf.y + 6;
  };
  detail('Booking', f.reference);
  detail('Service', f.service);
  detail('Provided by', f.provider?.name);
  detail('Booked on', f.bookedAt);
  detail('Scheduled for', f.at);
  detail('Paid by', `${f.method}${f.paid ? '' : ' (due)'}`);
  y += 8;

  // The bill.
  pdf.rect(X, y, W, 24).fill('#F8FAFC');
  pdf.font('b').fontSize(9).fillColor(MUTED).text('DESCRIPTION', X + 12, y + 8).text('AMOUNT', X, y + 8, { width: W - 12, align: 'right' });
  y += 32;
  for (const [label, paise] of f.linesPaise) {
    pdf.font('r').fontSize(10.5).fillColor(INK).text(label, X + 12, y, { width: W - 140 });
    pdf.text(paise < 0 ? `− ${rupees(-paise)}` : rupees(paise), X, y, { width: W - 12, align: 'right' });
    y += 22;
  }
  pdf.moveTo(X, y).lineTo(X + W, y).strokeColor(LINE).stroke();
  y += 10;
  pdf.font('b').fontSize(13).fillColor(INK).text(f.paid ? 'Total paid' : 'Total', X + 12, y).text(f.total, X, y, { width: W - 12, align: 'right' });
  y += 34;

  // What it means.
  pdf.font('r').fontSize(8.5).fillColor(MUTED).text(
    [
      `The service was provided by ${f.provider?.name || 'the provider named above'}, an independent professional on the ${s.brandName} platform.`,
      isTaxInvoice ? 'Taxes are shown above as charged.' : 'No GST was charged on this booking.',
      `Questions about this receipt: ${[s.supportEmail, s.supportPhone].filter(Boolean).join(', ') || 'contact support in the app'}.`,
      'This is a computer-generated document and needs no signature.',
    ].join(' '),
    X, y, { width: W, lineGap: 2 },
  );

  pdf.end();
  await done;
  return { buffer: Buffer.concat(chunks), filename: `${s.brandName}-${isTaxInvoice ? 'invoice' : 'receipt'}-${f.reference}.pdf`, number, facts: f };
}

// The same receipt as data, for the app to show on its own screen (no browser).
async function view(kind, doc) {
  const s = await require('./settings').get();
  const f = await jobFacts(kind, doc);
  const taxPaise = (f.linesPaise.find(([l]) => l === 'Taxes') || [0, 0])[1];
  const customer = doc.userId ? await require('../user/user.model').findById(doc.userId).select('name phone').lean() : null;
  return {
    title: s.gstin && taxPaise > 0 ? 'Tax invoice' : 'Receipt',
    number: receiptNumber(f, doc),
    issuedOn: doc.completedAt || doc.execution?.completedAt || doc.updatedAt || null,
    business: { name: s.brandName, legalName: s.legalName || '', address: s.address || '', gstin: s.gstin || '', email: s.supportEmail || '' },
    customer: { name: customer?.name || '', phone: customer?.phone || '', address: f.address || '' },
    service: f.service, provider: f.provider?.name || null, reference: f.reference,
    lines: f.linesPaise.map(([label, paise]) => ({ label, paise })), totalPaise: f.totalPaise,
    paidBy: f.method || null, paid: f.paid !== false,
  };
}

module.exports = { build, view, receiptNumber };
