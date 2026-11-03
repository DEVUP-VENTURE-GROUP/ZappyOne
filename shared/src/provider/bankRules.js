// Rules for a partner's UPI ID and bank account, the same as the server's (worker.routes bank-accounts, payment/upi-check). Platform-free: web and app.
export const UPI_FORMAT = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;
export const ACCOUNT_NUMBER = /^\d{6,18}$/;
export const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** What is wrong with the form for this tab, as { field: message }; empty when it can be sent. */
export function bankFormErrors(tab, form) {
  const e = {};
  if (tab === 'upi') {
    const upi = String(form.upiId || '').trim();
    if (!upi) e.upiId = 'Enter your UPI ID.';
    else if (!UPI_FORMAT.test(upi)) e.upiId = 'A UPI ID looks like name@bank, for example asif@oksbi.';
    return e;
  }
  const name = String(form.accountName || '').trim();
  const number = String(form.accountNumber || '').replace(/\s/g, '');
  const ifsc = String(form.ifsc || '').trim().toUpperCase();
  if (name.length < 2) e.accountName = 'Enter the account holder name, as the bank has it.';
  if (!number) e.accountNumber = 'Enter the account number.';
  else if (!ACCOUNT_NUMBER.test(number)) e.accountNumber = 'An account number is 6 to 18 digits, numbers only.';
  if (!ifsc) e.ifsc = 'Enter the IFSC code.';
  else if (!IFSC.test(ifsc)) e.ifsc = 'An IFSC is 11 characters, like HDFC0001234 (the 5th is a zero).';
  return e;
}
