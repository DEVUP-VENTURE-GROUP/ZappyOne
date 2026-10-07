/**
 * ZappyOne emails: one plain, readable layout (works in every mail app,
 * including Outlook), a single action button and the same link written out
 * for clients that strip buttons. Every email says why it was sent.
 */
/** The shared branded layout (messaging/layout), so account mail looks like every other ZappyOne email. */
function layout({ preheader, heading, paras, action, link, footer }) {
  const { render } = require('../../modules/messaging/layout');
  return render({
    s: require('../../modules/messaging/settings').current(),
    preheader, heading, intro: paras,
    button: action ? { label: action, url: link } : null,
    note: [action ? `Or open this link: ${link}` : null, footer].filter(Boolean).join(' '),
  }).html;
}

function verifyEmail({ name, link }) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: 'Confirm your email for ZappyOne',
    text: `${hi}\n\nConfirm this email address for your ZappyOne account:\n${link}\n\nThe link works for 24 hours. If you did not ask for this, ignore this email.`,
    html: layout({
      preheader: 'Confirm your email address',
      heading: 'Confirm your email',
      paras: [hi, 'Tap the button to confirm this email address for your ZappyOne account. We use it for receipts, statements and to help you get back in if you forget your password.'],
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
      paras: [hi, 'Someone asked to reset the password for your ZappyOne account. If it was you, choose a new password below.'],
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
      paras: [hi, 'The password for your ZappyOne account was just changed. If this was you, there is nothing to do.', 'If it was not you, reset your password right away and contact support.'],
      footer: 'You get this email whenever your password changes, for your security.',
    }),
  };
}

module.exports = { verifyEmail, passwordReset, passwordChanged };
