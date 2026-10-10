/**
 * The same password rules the server enforces, shown while typing so nobody
 * meets them only as an error after pressing the button. Platform-free: the
 * websites and the apps both read this.
 */
export function passwordChecks(pw = '', phone = '') {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  return [
    { ok: pw.length >= 8, label: 'At least 8 characters' },
    { ok: /[a-zA-Z]/.test(pw) && /\d/.test(pw), label: 'A letter and a number' },
    { ok: !digits || !pw.includes(digits), label: 'Not your phone number' },
  ];
}

export const passwordOk = (pw, phone) => passwordChecks(pw, phone).every((c) => c.ok);
