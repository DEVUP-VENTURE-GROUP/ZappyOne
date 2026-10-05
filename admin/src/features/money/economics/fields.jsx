/** Small inputs shared by the Economics tabs: rupees in, paise out; plain numbers with a unit. */

export const toRupees = (paise) => (paise == null ? '' : String(Math.round(paise) / 100));
export const toPaise = (rupees) => (rupees === '' || rupees == null ? NaN : Math.round(Number(rupees) * 100));

export function RupeeInput({ value, onChange, label, max = 100000 }) {
  return (
    <label className="flex w-full max-w-[128px] items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
      <span className="pl-3 text-sm text-slate-400">₹</span>
      <input type="number" min="0" max={max} step="1" inputMode="decimal" value={value} aria-label={label}
        onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent px-2 py-2 text-sm tabular-nums outline-none" />
    </label>
  );
}

export function UnitInput({ value, onChange, label, unit, min = 0, max, step = 1 }) {
  return (
    <label className="flex w-full max-w-[128px] items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-blue-500">
      <input type="number" min={min} max={max} step={step} inputMode="decimal" value={value} aria-label={label}
        onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent px-3 py-2 text-sm tabular-nums outline-none" />
      <span className="pr-3 text-sm text-slate-400">{unit}</span>
    </label>
  );
}

/** One setting: what it is, what it does, and its box. */
export function Setting({ title, hint, children }) {
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {hint && <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
