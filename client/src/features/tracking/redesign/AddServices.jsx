import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Loader2, Plus } from 'lucide-react';
import { rupeesOf } from '@shared/customer/trackingSteps';
import { useAddJobExtraMutation } from '@shared/services/api';
import { Section } from './Section';

// "Add to this booking": the pro's own prices for what fits this job; each is added to the bill and paid in cash at the end.
export default function AddServices({ job, extras, added = [], onAdded }) {
  const [asking, setAsking] = useState(null);
  const [add, { isLoading }] = useAddJobExtraMutation();
  const items = extras?.allowed ? extras.items || [] : [];
  if (!items.length && !added.length) return null;
  const keyOf = (i) => `${i.code}:${i.petIndex ?? ''}`;

  async function confirm(item) {
    try {
      const r = await add({ id: job.id, code: item.code, petIndex: item.petIndex ?? null }).unwrap();
      toast.success(r.message);
      setAsking(null);
      onAdded?.();
    } catch (err) { toast.error(err?.data?.error || 'Could not add that. Try again.'); }
  }

  return (
    <Section title="Add to this booking">
      <p className="text-[13px] text-ink-500">Your pro&apos;s price. Pay for anything you add in cash when the job is done.</p>
      <ul className="mt-1 divide-y divide-line">
        {added.map((a, i) => (
          <li key={`added-${i}`} className="flex items-center gap-3 py-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-green-50 text-green-700"><Check size={16} /></span>
            <span className="min-w-0 flex-1 text-[14.5px] text-ink-900">{a.name}<span className="block text-[12.5px] text-ink-500">Added. Pay in cash</span></span>
            <span className="text-[14px] font-semibold tabular-nums text-ink-900">{rupeesOf(a.pricePaise)}</span>
          </li>
        ))}
        {items.map((item) => {
          const open = asking === keyOf(item);
          return (
            <li key={keyOf(item)} className="py-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[14.5px] text-ink-900">{item.name}{item.petName && <span className="block text-[12.5px] text-ink-500">For {item.petName}</span>}</span>
                <span className="text-[14px] font-semibold tabular-nums text-ink-900">{rupeesOf(item.pricePaise)}</span>
                {!open && (
                  <button type="button" onClick={() => setAsking(keyOf(item))} aria-label={`Add ${item.name}`}
                    className="flex h-9 items-center gap-1 rounded-btn border border-line px-3 text-[13.5px] font-bold text-zappy-700 hover:bg-sunken">
                    <Plus size={15} /> Add
                  </button>
                )}
              </div>
              {open && (
                <div className="mt-2.5 flex items-center gap-2 rounded-btn bg-sunken p-2.5">
                  <p className="min-w-0 flex-1 text-[13px] text-ink-700">Add {item.name}? Any tax is added on top. You pay in cash at the end.</p>
                  <button type="button" onClick={() => setAsking(null)} className="h-9 px-2 text-[13.5px] font-semibold text-ink-600">No</button>
                  <button type="button" onClick={() => confirm(item)} disabled={isLoading} className="btn-primary h-9 px-4 text-[13.5px]">
                    {isLoading && <Loader2 size={14} className="animate-spin" />} Add
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
