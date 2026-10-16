const SPANS = [[7, '7 days'], [30, '30 days'], [90, '90 days']];

// Which stretch of past demand to read.
export default function DaysPicker({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Period">
      {SPANS.map(([d, label]) => (
        <button key={d} type="button" onClick={() => onChange(d)} aria-pressed={value === d}
          className={`rounded-md px-3 py-1 text-xs font-semibold ${value === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
      ))}
    </div>
  );
}
