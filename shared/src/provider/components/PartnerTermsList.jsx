import { CheckCircle2 } from 'lucide-react';

// The partner terms as plain points, with the rate first (server shop/partner-terms).
export default function PartnerTermsList({ terms }) {
  if (!terms) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      <p className="text-[13px] font-bold text-slate-900">Commission: {terms.ratePct}% per completed job</p>
      <ul className="mt-2 space-y-1.5">
        {terms.points.map((p) => (
          <li key={p} className="flex gap-2 text-[12.5px] leading-snug text-slate-600">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <a href={terms.fullTermsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12px] font-semibold text-zappy-600">Read the full terms</a>
    </div>
  );
}
