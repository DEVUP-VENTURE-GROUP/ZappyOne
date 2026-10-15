import toast from 'react-hot-toast';
import { ChevronRight } from 'lucide-react';
import { offerHeadline, offerTerms } from '../../../customer/season';

/**
 * The season's offer: a live promo code, said as it is ("20% off, up to ₹150").
 * Tap copies the code for checkout. Nothing shows when the promo is not live.
 */
export default function FestiveOffer({ offer, theme }) {
  if (!offer) return null;
  const terms = offerTerms(offer);

  async function copy() {
    try { await navigator.clipboard.writeText(offer.code); toast.success(`${offer.code} copied. Apply it at checkout.`); } catch { toast(`Use code ${offer.code} at checkout`); }
  }

  return (
    <button type="button" onClick={copy} aria-label={`${offerHeadline(offer)}, code ${offer.code}. Copy code`}
      className="fz-sheen flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-left shadow-[0_6px_20px_-12px_rgba(0,0,0,.35)] ring-1 ring-black/5">
      <span className="flex h-11 shrink-0 items-center rounded-xl px-3 text-[15px] font-extrabold tracking-tight text-white" style={{ background: theme.accent }}>
        {offerHeadline(offer)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold text-ink-900">{offer.name}</span>
        <span className="block truncate text-[12px] text-ink-500">
          Code <b className="font-semibold tracking-wide text-ink-700">{offer.code}</b>{terms ? ` · ${terms}` : ''}
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-400" />
    </button>
  );
}
