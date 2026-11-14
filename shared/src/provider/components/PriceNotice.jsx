import { BadgeIndianRupee } from 'lucide-react';
import { PRICE_NOTICE } from '../jobFlows';

// The one line above every price a provider types (menu, model prices, pet and helping rates).
export default function PriceNotice() {
  return (
    <p role="note" className="flex items-start gap-2.5 rounded-xl border border-zappy-100 bg-zappy-50 px-3 py-2.5 text-[13px] font-semibold leading-snug text-zappy-800">
      <BadgeIndianRupee size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{PRICE_NOTICE}</span>
    </p>
  );
}
