import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { formatPaise } from '@client/utils/money';

export function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="animate-spin text-blue-600" />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-48">
      <Spinner size={24} />
    </div>
  );
}

export function EmptyState({ message = 'No data found', icon: Icon }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <Icon size={22} className="text-slate-400" />
        </div>
      )}
      <p className="text-slate-500 font-medium text-sm">{message}</p>
    </div>
  );
}

export function SectionHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, Icon, color = 'text-blue-600', bg = 'bg-blue-50', sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
        <Icon size={16} className={color} />
      </div>
      <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{value}</p>
      <p className="text-xs text-slate-400 font-semibold mt-1">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-100 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Pagination({ page, total, limit = 50, onPrev, onNext, totalPages, onChange }) {
  // Supports two calling conventions:
  //   { page, total, limit, onPrev, onNext }  (legacy)
  //   { page, totalPages, onChange }           (new)
  const pages = totalPages ?? (total ? Math.ceil(total / limit) : null);
  const handlePrev = onPrev ?? (() => onChange && onChange(page - 1));
  const handleNext = onNext ?? (() => onChange && onChange(page + 1));
  return (
    <div className="flex items-center justify-between pt-1">
      <button
        disabled={page <= 1}
        onClick={handlePrev}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        <ChevronLeft size={13} /> Prev
      </button>
      <span className="text-xs text-slate-400 font-medium">
        Page {page}{pages ? ` / ${pages}` : ''}{total != null ? ` · ${total} total` : ''}
      </span>
      <button
        disabled={pages != null && page >= pages}
        onClick={handleNext}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Next <ChevronRight size={13} />
      </button>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    completed: 'bg-green-100 text-green-700',
    in_progress: 'bg-blue-100 text-blue-700',
    on_the_way: 'bg-blue-100 text-blue-700',
    assigned: 'bg-blue-100 text-blue-700',
    searching: 'bg-yellow-100 text-yellow-700',
    cancelled: 'bg-red-100 text-red-700',
    failed: 'bg-red-100 text-red-700',
    open: 'bg-orange-100 text-orange-700',
    resolved: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    processing: 'bg-blue-100 text-blue-700',
    online: 'bg-green-100 text-green-700',
    offline: 'bg-slate-100 text-slate-600',
    blocked: 'bg-red-100 text-red-700',
    not_submitted: 'bg-slate-100 text-slate-500',
    pending_review: 'bg-yellow-100 text-yellow-700',
  };
  const cls = map[status] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${cls}`}>
      {(status || '—').replace(/_/g, ' ')}
    </span>
  );
}

export function Th({ children, right }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wide bg-slate-50 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

export function Td({ children, right, mono, muted }) {
  return (
    <td className={`px-4 py-3 text-sm ${right ? 'text-right' : ''} ${mono ? 'font-mono text-xs' : ''} ${muted ? 'text-slate-500' : 'text-slate-700'}`}>
      {children}
    </td>
  );
}

/** Simple SVG bar chart */
export function BarChart({ data = [], valueKey = 'value', labelKey = 'label', color = '#2563EB', height = 80 }) {
  const vals = data.map(d => Number(d[valueKey]) || 0);
  const max = Math.max(...vals, 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
            {d[labelKey]}: {vals[i].toLocaleString()}
          </div>
          <div
            className="w-full rounded-sm transition-all"
            style={{ height: `${Math.max((vals[i] / max) * 100, 2)}%`, backgroundColor: color, opacity: 0.8 + 0.2 * (i % 2) }}
          />
        </div>
      ))}
    </div>
  );
}

/** Simple SVG line sparkline */
export function LineSparkline({ data = [], color = '#2563EB' }) {
  if (data.length < 2) return <div className="h-full w-full bg-slate-50 rounded" />;
  const vals = data.map(d => Number(d.value || d.revenuePaise || d.totalPaise || 0));
  const max = Math.max(...vals, 1);
  const min = 0;
  const range = max - min || 1;
  const W = 300, H = 60;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const areapts = `0,${H} ${pts} ${W},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areapts} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

export function FormRow({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export function Input({ ...props }) {
  return (
    <input
      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
      {...props}
    />
  );
}

export function Select({ children, ...props }) {
  return (
    <select
      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition"
      {...props}
    >
      {children}
    </select>
  );
}

export function SaveBtn({ loading, onClick, children, label }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm px-4 py-2 rounded-lg transition"
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children ?? label ?? 'Save Changes'}
    </button>
  );
}

/** Admin money display. Takes PAISE, like everything stored. */
export const fmt = formatPaise;

export function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}
