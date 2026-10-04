/**
 * ZappyOne emails: one plain, readable layout (works in every mail app,
 * including Outlook), a single action button and the same link written out
 * for clients that strip buttons. Every email says why it was sent.
 */
const BRAND = '#1F4FD8';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function layout({ preheader, heading, body, action, link, footer }) {
  const html = `<!doctype html><html><body style="margin:0;background:#F5F6F8;font-family:Arial,Helvetica,sans-serif;color:#101828">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E3E6EB;border-radius:14px">
<tr><td style="padding:28px 28px 8px"><div style="font-size:20px;font-weight:700;color:${BRAND}">ZappyOne</div></td></tr>
<tr><td style="padding:8px 28px 0"><h1 style="margin:0;font-size:22px;line-height:1.3;color:#101828">${esc(heading)}</h1></td></tr>
<tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.6;color:#344054">${body}</td></tr>
${action ? `<tr><td style="padding:24px 28px 8px"><a href="${esc(link)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px">${esc(action)}</a></td></tr>
<tr><td style="padding:8px 28px 0;font-size:13px;line-height:1.5;color:#667085">Or open this link:<br><a href="${esc(link)}" style="color:${BRAND};word-break:break-all">${esc(link)}</a></td></tr>` : ''}
<tr><td style="padding:24px 28px 28px;font-size:12px;line-height:1.5;color:#98A2B3">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return html;
}

function verifyEmail({ name, link }) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: 'Confirm your email for ZappyOne',
    text: `${hi}\n\nConfirm this email address for your ZappyOne account:\n${link}\n\nThe link works for 24 hours. If you did not ask for this, ignore this email.`,
    html: layout({
      preheader: 'Confirm your email address',
      heading: 'Confirm your email',
      body: `${esc(hi)}<br><br>Tap the button to confirm this email address for your ZappyOne account. We use it for receipts, statements and to help you get back in if you forget your password.`,
      action: 'Confirm email',
      link,
      footer: 'The link works for 24 hours. If you did not ask for this, you can ignore this email; nothing changes on your account.',
    }),
  };
}

function passwordReset({ name, link }) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: 'Reset your ZappyOne password',
    text: `${hi}\n\nReset your ZappyOne password here:\n${link}\n\nThe link works for 30 minutes and only once. If you did not ask for this, ignore this email; your password stays the same.`,
    html: layout({
      preheader: 'Reset your password',
      heading: 'Reset your password',
      body: `${esc(hi)}<br><br>Someone asked to reset the password for your ZappyOne account. If it was you, choose a new password below.`,
      action: 'Choose a new password',
      link,
      footer: 'The link works for 30 minutes and only once. If you did not ask for this, ignore this email; your password stays the same.',
    }),
  };
}

function passwordChanged({ name }) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: 'Your ZappyOne password was changed',
    text: `${hi}\n\nThe password for your ZappyOne account was just changed. If this was not you, reset it now and contact support.`,
    html: layout({
      preheader: 'Your password was changed',
      heading: 'Your password was changed',
      body: `${esc(hi)}<br><br>The password for your ZappyOne account was just changed. If this was you, there is nothing to do.<br><br>If it was not you, reset your password right away and contact support.`,
      footer: 'You get this email whenever your password changes, for your security.',
    }),
  };
}

module.exports = { verifyEmail, passwordReset, passwordChanged };
