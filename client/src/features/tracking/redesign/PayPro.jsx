import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import { Banknote, Check, Copy, Loader2, Phone, Smartphone } from 'lucide-react';
import { rupeesOf } from '@shared/customer/trackingSteps';
import { upiLink, cleanUpiRef, isUpiRef, helpPhoneFor } from '@shared/customer/upiPay';
import { useClaimJobPaymentMutation } from '@shared/services/api';
import { Section } from './Section';

const onPhone = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent || '');

// The job is done: pay the pro directly, by UPI to their own ID or in cash, then say so; the pro confirms (server jobs/pay-direct).
export default function PayPro({ jobId, payTo, onClaimed }) {
  const [method, setMethod] = useState(payTo.claim?.method || (payTo.methods.includes('upi') ? 'upi' : 'cash'));
  const [qr, setQr] = useState(null);
  const [claim, { isLoading }] = useClaimJobPaymentMutation();
  const [utr, setUtr] = useState('');
  const [changing, setChanging] = useState(false);
  const { amountPaise, to, reference } = payTo;
  const amount = rupeesOf(amountPaise);
  const link = to.upiId ? upiLink({ upiId: to.upiId, name: to.name, amountPaise, reference }) : null;
  const phone = onPhone();

  useEffect(() => {
    if (method !== 'upi' || !link || phone) return;
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#101828', light: '#FFFFFF' } }).then(setQr).catch(() => setQr(null));
  }, [method, link, phone]);

  async function say(m) {
    try { toast.success((await claim({ id: jobId, method: m, ...(m === 'upi' && { utr }) }).unwrap()).message); setChanging(false); onClaimed?.(); }
    catch (err) { toast.error(err?.data?.error || 'Could not send that. Try again.'); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(to.upiId); toast.success('UPI ID copied'); } catch { toast(to.upiId); }
  }

  const waiting = changing ? null : payTo.claim?.method;
  const helpPhone = helpPhoneFor(payTo.claim, payTo.help);
  return (
    <Section>
      <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-400">Job done</p>
      <h2 className="mt-1 text-[24px] font-extrabold tracking-[-0.02em] text-ink-900">Pay {to.name} {amount}</h2>
      <p className="mt-0.5 text-[13.5px] text-ink-500">You pay your pro directly. {reference ? `Booking ${reference}.` : ''}</p>

      {waiting ? (
        <div className="mt-4 flex items-start gap-3 rounded-card bg-zappy-50 p-3.5">
          <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-zappy-700" />
          <p className="text-[14px] text-zappy-900">
            {waiting === 'upi' ? `Waiting for ${to.name} to confirm your UPI payment${payTo.claim?.utr ? ` (ref ${payTo.claim.utr})` : ''}.` : `Hand ${amount} in cash to ${to.name}. They will confirm it.`}
            <button type="button" onClick={() => (waiting === 'upi' ? say('cash') : (setMethod('upi'), setChanging(true)))} disabled={isLoading || (waiting === 'cash' && !link)}
              className="ml-1 font-semibold text-zappy-700 underline disabled:hidden">{waiting === 'upi' ? 'Paying cash instead?' : 'Pay by UPI instead?'}</button>
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="How you pay">
            {[['upi', Smartphone, 'UPI', link ? 'Any UPI app' : 'Not added by your pro'], ['cash', Banknote, 'Cash', `Hand it to ${to.name}`]].map(([m, Icon, label, sub]) => (
              <button key={m} type="button" role="radio" aria-checked={method === m} disabled={m === 'upi' && !link} onClick={() => setMethod(m)}
                className={`flex items-center gap-3 rounded-card border-2 p-3 text-left disabled:opacity-50 ${method === m ? 'border-zappy-600 bg-zappy-50' : 'border-line bg-white'}`}>
                <Icon size={22} className={method === m ? 'text-zappy-700' : 'text-ink-500'} />
                <span className="min-w-0"><span className="block text-[15px] font-bold text-ink-900">{label}</span><span className="block truncate text-[12px] text-ink-500">{sub}</span></span>
              </button>
            ))}
          </div>

          {method === 'upi' && link && (
            <div className="mt-4 space-y-3">
              {phone
                ? <a href={link} className="btn-primary h-12 w-full text-[15.5px]">Pay {amount} with a UPI app</a>
                : qr && (
                  <div className="flex items-center gap-4 rounded-card border border-line p-3">
                    <img src={qr} alt={`UPI QR code to pay ${amount} to ${to.name}`} className="h-32 w-32 shrink-0" />
                    <p className="text-[13.5px] text-ink-700">Scan with GPay, PhonePe, Paytm or any UPI app. The amount is filled in.</p>
                  </div>
                )}
              <div className="flex items-center gap-2 rounded-btn bg-sunken px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink-900"><span className="text-ink-500">UPI ID </span>{to.upiId}</span>
                <button type="button" onClick={copy} className="flex items-center gap-1 text-[13.5px] font-bold text-zappy-700"><Copy size={14} /> Copy</button>
              </div>
              <label className="block">
                <span className="text-[13px] font-semibold text-ink-700">UPI reference (12 digits)</span>
                <input inputMode="numeric" autoComplete="off" value={utr} onChange={(e) => setUtr(cleanUpiRef(e.target.value))} placeholder="e.g. 431298765012"
                  className="input mt-1 w-full tabular-nums tracking-wider" aria-describedby="utr-hint" />
                <span id="utr-hint" className="mt-1 block text-[12px] text-ink-500">In your UPI app, open this payment. The 12-digit UPI ref or UTR number is on the receipt.</span>
              </label>
              <button type="button" onClick={() => say('upi')} disabled={isLoading || !isUpiRef(utr)} className={`${phone ? 'btn-outline' : 'btn-primary'} h-12 w-full disabled:opacity-50`}>
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} />} I've paid {amount}
              </button>
            </div>
          )}
          {method === 'cash' && (
            <button type="button" onClick={() => say('cash')} disabled={isLoading} className="btn-primary mt-4 h-12 w-full">
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={18} />} I'm paying {amount} in cash
            </button>
          )}
        </>
      )}
      {helpPhone && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card border border-line p-3 text-[13.5px] text-ink-700">
          <span className="min-w-0 flex-1">Not confirmed yet? ZappyOne can help: <b className="select-all tabular-nums">{helpPhone}</b></span>
          <a href={`tel:${helpPhone.replace(/\s+/g, '')}`} className="btn-outline inline-flex h-10 items-center gap-1.5 px-3 text-[13.5px]"><Phone size={15} /> Call ZappyOne</a>
        </div>
      )}
    </Section>
  );
}
