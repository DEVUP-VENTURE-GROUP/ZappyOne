import { statusHeadline } from '@shared/customer/trackingSteps';

// The headline of tracking: one sentence in large type, the minutes in colour, and the rows that belong to this moment.
export default function StatusBlock({ job, status, eta, options, needsYou, children }) {
  const h = statusHeadline(job, status, eta, { arrival: options?.arrival, moreTime: options?.moreTime, needsYou });
  return (
    <section className="border-b-8 border-sunken bg-white px-4 pb-1 pt-5 sm:px-6" aria-live="polite">
      <h1 className="text-[23px] font-extrabold leading-tight tracking-[-0.02em] text-ink-900 [text-wrap:balance]">
        {h.title}
        {h.minutes != null && <> <span className={`tabular-nums ${h.late ? 'text-amber-600' : 'text-green-700'}`}>{h.minutes} {h.minutes === 1 ? 'min' : 'mins'}</span></>}
      </h1>
      {h.sub && <p className="mt-1.5 pb-3 text-[14.5px] leading-snug text-ink-500">{h.sub}</p>}
      <div className="divide-y divide-line border-t border-line empty:hidden">{children}</div>
    </section>
  );
}
