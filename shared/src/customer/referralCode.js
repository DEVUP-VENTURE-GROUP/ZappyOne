// A friend's invite code as people type or link it: letters, numbers, - and _, 4 to 20 long, in capitals. Websites and apps alike.
export function cleanReferralCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9_-]{4,20}$/.test(code) ? code : null;
}
