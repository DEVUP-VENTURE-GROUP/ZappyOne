/**
 * One email layout for everything ZappyOne sends.
 *
 * Email clients are not browsers: Gmail strips <style>, Outlook renders with
 * Word, dark mode inverts colours on its own. So this is the boring, reliable
 * kind of HTML: tables for layout, every style inline, system fonts with a
 * web-safe fallback, images by absolute URL with alt text and fixed sizes, a
 * hidden preheader for the inbox preview, and a plain-text twin of every
 * message (spam filters and some readers want it).
 *
 *   render({ s, recipientKind, preheader, heading, intro, rows, items, total,
 *            button, note, footerNote, promotional })
 */
const BRAND = '#1F4FD8';
const INK = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const CANVAS = '#F4F6FA';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function detailRows(rows = []) {
  return rows.filter((r) => r && r[1] != null && r[1] !== '').map(([label, value, strong]) => `
    <tr>
      <td style="padding:7px 0;font:14px/20px ${FONT};color:${MUTED};vertical-align:top;width:42%">${esc(label)}</td>
      <td style="padding:7px 0;font:${strong ? '600 ' : ''}14px/20px ${FONT};color:${INK};text-align:right;vertical-align:top">${esc(value)}</td>
    </tr>`).join('');
}

function itemRows(items = [], total = null) {
  if (!items.length) return '';
  const lines = items.map(([label, amount]) => `
    <tr>
      <td style="padding:6px 0;font:14px/20px ${FONT};color:${INK}">${esc(label)}</td>
      <td style="padding:6px 0;font:14px/20px ${FONT};color:${INK};text-align:right;white-space:nowrap">${esc(amount)}</td>
    </tr>`).join('');
  const sum = total ? `
    <tr><td colspan="2" style="padding:0"><div style="height:1px;background:${LINE};margin:6px 0"></div></td></tr>
    <tr>
      <td style="padding:6px 0;font:700 15px/22px ${FONT};color:${INK}">${esc(total[0])}</td>
      <td style="padding:6px 0;font:700 15px/22px ${FONT};color:${INK};text-align:right;white-space:nowrap">${esc(total[1])}</td>
    </tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${lines}${sum}</table>`;
}

function render({
  s, recipientKind = 'user', preheader = '', heading, intro = [], rows = [], items = [], total = null,
  button = null, note = '', footerNote = '', promotional = false,
}) {
  const site = require('./settings').appUrl(s, recipientKind);
  const logo = `${s.customerUrl}/logo.png`;
  const paras = (Array.isArray(intro) ? intro : [intro]).filter(Boolean);
  const contact = [s.supportPhone && `Call ${s.supportPhone}`, s.supportEmail && `write to ${s.supportEmail}`].filter(Boolean).join(' or ');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS}">
<tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:4px 4px 16px">
      <a href="${esc(site)}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle"><img src="${esc(logo)}" width="44" height="44" alt="" style="display:block;border:0;border-radius:10px"></td>
        <td style="vertical-align:middle;padding-left:10px;font:800 20px/24px ${FONT};color:${INK};letter-spacing:-0.3px">${esc(s.brandName)}</td>
      </tr></table></a>
    </td></tr>
    <tr><td style="background:#FFFFFF;border-radius:16px;border:1px solid ${LINE};overflow:hidden">
      <div style="height:4px;background:${BRAND}"></div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 28px 24px">
        <h1 style="margin:0 0 12px;font:700 22px/30px ${FONT};color:${INK}">${esc(heading)}</h1>
        ${paras.map((p) => `<p style="margin:0 0 12px;font:15px/24px ${FONT};color:#334155">${esc(p)}</p>`).join('')}
        ${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE}">${detailRows(rows)}</table>` : ''}
        ${itemRows(items, total)}
        ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="border-radius:10px;background:${BRAND}">
          <a href="${esc(button.url)}" style="display:inline-block;padding:13px 22px;font:600 15px/20px ${FONT};color:#FFFFFF;text-decoration:none;border-radius:10px">${esc(button.label)}</a>
        </td></tr></table>` : ''}
        ${note ? `<p style="margin:16px 0 0;font:13px/20px ${FONT};color:${MUTED}">${esc(note)}</p>` : ''}
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:18px 8px 0;font:12px/18px ${FONT};color:${MUTED};text-align:center">
      ${contact ? `Need help? ${esc(contact)}.<br>` : ''}
      ${footerNote ? `${esc(footerNote)}<br>` : ''}
      ${esc(s.legalName ? `${s.brandName} is a venture of ${s.legalName}` : s.brandName)}${s.address ? `<br>${esc(s.address)}` : ''}
      ${promotional ? `<br><a href="${esc(site)}/notification-prefs" style="color:${MUTED}">Stop these emails</a>` : ''}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    heading, '',
    ...paras, paras.length ? '' : null,
    ...rows.filter((r) => r && r[1] != null && r[1] !== '').map(([l, v]) => `${l}: ${v}`),
    ...(items.length ? ['', ...items.map(([l, a]) => `${l}  ${a}`), ...(total ? [`${total[0]}  ${total[1]}`] : [])] : []),
    button ? `\n${button.label}: ${button.url}` : null,
    note ? `\n${note}` : null,
    '', '-', s.legalName ? `${s.brandName}, a venture of ${s.legalName}` : s.brandName, contact ? `Need help? ${contact}.` : null,
    promotional ? `Stop these emails: ${site}/notification-prefs` : null,
  ].filter((l) => l !== null).join('\n');

  return { html, text };
}

module.exports = { render, esc };
