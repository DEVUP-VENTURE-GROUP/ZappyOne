/** Pick a month (YYYY-MM), this one and the 11 before it. */
export default function MonthPicker({ value, onChange }) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
  });
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Month"
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
      {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
    </select>
  );
}

export const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
