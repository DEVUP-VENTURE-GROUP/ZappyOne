import { Banknote, CreditCard, Loader2 } from 'lucide-react';
import { useOnlinePayAvailable, usePayBooking } from '../../hooks/usePayBooking';

/**
 * Cash or online, chosen before booking. "Online" only appears while the
 * server says the gateway works; otherwise this is a plain statement that the
 * job is paid in cash, so nobody is surprised at the door.
 */
export function PayMethodPicker({ value, onChange, onlineAllowed = true, cashNote = 'Pay the provider directly once the job is done.' }) {
  const online = useOnlinePayAvailable() && onlineAllowed;
  const method = online ? value : 'cash';

  if (!online) {
    return (
      <div className="card bg-emerald-50 ring-emerald-100">
        <div className="flex items-start gap-2.5">
          <Banknote size={16} className="mt-0.5 shrink-0 text-emerald-700" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-emerald-900">Pay in cash</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-emerald-700">{cashNote} Nothing is charged now.</p>
          </div>
        </div>
      </div>
    );
  }

  const options = [
    { key: 'cash', icon: Banknote, title: 'Cash after the job', note: cashNote },
    { key: 'online', icon: CreditCard, title: 'Pay online', note: 'UPI, card or net banking through Cashfree.' },
  ];
  return (
    <div className="card space-y-2" role="radiogroup" aria-label="How you will pay">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">How you will pay</p>
      {options.map(({ key, icon: Icon, title, note }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={method === key}
          onClick={() => onChange(key)}
          className={`w-full flex items-start gap-2.5 rounded-xl p-3 text-left ring-1 transition ${
            method === key ? 'ring-2 ring-[#0F172A] bg-slate-50' : 'ring-slate-200'
          }`}
        >
          <Icon size={16} className="mt-0.5 shrink-0 text-[#0F172A]" />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-bold text-[#0F172A]">{title}</span>
            <span className="block mt-0.5 text-[11.5px] leading-relaxed text-slate-500">{note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * "Pay now" on a booking chosen for online payment and not yet paid.
 * Hidden while online payment is unavailable — the booking can still be
 * settled in cash, which the provider records.
 */
export function PayNowButton({ bookingSource, bookingId, amountLabel, label, onPaid, className = '' }) {
  const online = useOnlinePayAvailable();
  const { pay, paying } = usePayBooking();
  if (!online) return null;
  return (
    <button
      type="button"
      disabled={paying}
      onClick={async () => { if (await pay({ bookingSource, bookingId, label })) onPaid?.(); }}
      className={`btn-primary w-full ${className}`}
    >
      {paying
        ? <><Loader2 size={15} className="animate-spin" /> Opening payment…</>
        : <><CreditCard size={15} /> Pay now{amountLabel ? ` · ${amountLabel}` : ''}</>}
    </button>
  );
}
