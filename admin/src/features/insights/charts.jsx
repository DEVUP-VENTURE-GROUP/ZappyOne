import { useId, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

/**
 * Chart pieces for Insights, drawn in SVG: no chart library, so the admin app
 * stays small and every chart matches the console. Each one says something
 * when there is nothing to draw, instead of showing an empty frame.
 */

/** ₹ in the Indian way: ₹840, ₹12.4K, ₹3.2L, ₹1.1Cr. Takes paise. */
export function rupees(paise, { exact = false } = {}) {
  const r = Math.round((Number(paise) || 0) / 100);
  if (exact || r < 1000) return `₹${r.toLocaleString('en-IN')}`;
  if (r < 100000) return `₹${(r / 1000).toFixed(r < 10000 ? 1 : 0)}K`;
  if (r < 10000000) return `₹${(r / 100000).toFixed(1)}L`;
  return `₹${(r / 10000000).toFixed(2)}Cr`;
}
export const count = (n) => (Number(n) || 0).toLocaleString('en-IN');
export const minutes = (m) => (m == null ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`);
const shortDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Change against the previous period. `invert` when lower is better (cancellations). */
export function Delta({ value, invert = false, suffix = '%' }) {
  if (value == null) return <span className="text-[11px] font-semibold text-slate-400">new</span>;
  const good = invert ? value < 0 : value > 0;
  const flat = Math.abs(value) < 0.5;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? 'bg-slate-100 text-slate-500' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}>
      <Icon size={11} strokeWidth={2.5} />{Math.abs(value)}{suffix}
    </span>
  );
}

/** A tiny line for a KPI card. */
export function Spark({ values = [], color = '#1F4FD8' }) {
  const id = useId();
  if (values.length < 2 || values.every((v) => !v)) return <div className="h-8" />;
  const w = 120; const h = 32; const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - (v / max) * (h - 6)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.18" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** One headline number: label, value, change, and its little trend. */
export function Kpi({ label, value, delta, invert, spark, hint, accent = '#1F4FD8' }) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/70 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-slate-500">{label}</p>
        {delta !== undefined && <Delta value={delta} invert={invert} />}
      </div>
      <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1.5 text-[11.5px] text-slate-400">{hint}</p>}
      {spark && <div className="mt-auto pt-3"><Spark values={spark} color={accent} /></div>}
    </div>
  );
}

/**
 * Daily trend: bars for this period, a dashed line for the same days of the
 * previous period, and an optional second series as a line on its own scale
 * (money beside counts). Hover shows the day's numbers.
 */
export function TrendChart({ days = [], bar, barLabel, prev, line, lineLabel, lineFormat = count, barFormat = count, height = 220, sameScale = false }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const w = 720; const h = height; const pad = { l: 8, r: 8, t: 14, b: 26 };
  const n = days.length;
  const barMax = Math.max(1, ...days.map((d) => Math.max(d[bar] || 0, prev ? d[prev] || 0 : 0)));
  // Money gets its own scale beside counts; the same unit (people and people) shares one, so heights compare honestly.
  const lineMax = sameScale ? barMax : line ? Math.max(1, ...days.map((d) => d[line] || 0)) : 1;
  const x = (i) => pad.l + ((i + 0.5) / n) * (w - pad.l - pad.r);
  const bw = Math.max(4, Math.min(34, ((w - pad.l - pad.r) / n) * 0.56));
  const yb = (v) => h - pad.b - (v / barMax) * (h - pad.t - pad.b);
  const yl = (v) => (sameScale ? yb(v) : h - pad.b - (v / lineMax) * (h - pad.t - pad.b - 10));
  const empty = !days.some((d) => d[bar] || (prev && d[prev]) || (line && d[line]));

  const prevPath = prev ? days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yb(d[prev] || 0).toFixed(1)}`).join(' ') : null;
  const linePath = line ? smooth(days.map((d, i) => [x(i), yl(d[line] || 0)])) : null;
  const step = Math.ceil(n / 7);

  function move(e) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.floor(((e.clientX - r.left) / r.width) * n);
    setHover(i >= 0 && i < n ? i : null);
  }

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[11.5px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#1F4FD8]" />{barLabel}</span>
        {prev && <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-slate-300" />Previous period</span>}
        {line && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-emerald-500" />{lineLabel}</span>}
      </div>
      {empty ? (
        <div className="flex items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400" style={{ height }}>No bookings in this period yet</div>
      ) : (
        <svg ref={ref} viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none"
          onMouseMove={move} onMouseLeave={() => setHover(null)} role="img" aria-label={`${barLabel} per day`}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={pad.l} x2={w - pad.r} y1={yb(barMax * f)} y2={yb(barMax * f)} stroke="#EEF1F6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {days.map((d, i) => (
            <rect key={d.date} x={x(i) - bw / 2} y={yb(d[bar] || 0)} width={bw} height={Math.max(0, h - pad.b - yb(d[bar] || 0))} rx="3"
              fill={hover === i ? '#173FB0' : '#1F4FD8'} opacity={hover == null || hover === i ? 1 : 0.55} />
          ))}
          {prevPath && <path d={prevPath} fill="none" stroke="#B8C0CC" strokeWidth="1.6" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
          {linePath && <path d={linePath} fill="none" stroke="#10B981" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />}
          {days.map((d, i) => (i % step === 0 || i === n - 1) && (
            <text key={`t-${d.date}`} x={x(i)} y={h - 8} textAnchor="middle" fontSize="11" fill="#94A3B8">{shortDay(d.date)}</text>
          ))}
        </svg>
      )}
      {hover != null && !empty && (
        <div className="pointer-events-none absolute top-8 z-10 min-w-[150px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-lg"
          style={{ left: `clamp(0px, calc(${((hover + 0.5) / n) * 100}% - 75px), calc(100% - 160px))` }}>
          <p className="font-semibold text-slate-800">{shortDay(days[hover].date)}</p>
          <p className="mt-1 flex justify-between gap-3 text-slate-600"><span>{barLabel}</span><b className="tabular-nums text-slate-900">{barFormat(days[hover][bar])}</b></p>
          {prev && <p className="flex justify-between gap-3 text-slate-400"><span>Previous</span><span className="tabular-nums">{barFormat(days[hover][prev])}</span></p>}
          {line && <p className="flex justify-between gap-3 text-emerald-700"><span>{lineLabel}</span><b className="tabular-nums">{lineFormat(days[hover][line])}</b></p>}
        </div>
      )}
    </div>
  );
}

/** A gentle curve through the points (midpoint quadratic), never overshooting below the axis. */
function smooth(pts) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
}

/** A ranked list with a bar per row; `format` turns the value into text. */
export function RankBars({ rows = [], value, format = count, sub, color = '#1F4FD8', empty = 'Nothing yet' }) {
  const max = useMemo(() => Math.max(1, ...rows.map((r) => r[value] || 0)), [rows, value]);
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key || r.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium text-slate-700">{r.label}</span>
            <span className="shrink-0 tabular-nums font-semibold text-slate-900">{format(r[value])}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, ((r[value] || 0) / max) * 100)}%`, background: color }} />
          </div>
          {sub && <p className="mt-1 text-[11.5px] text-slate-400">{sub(r)}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * A funnel: one bar per step, narrowing as people drop out, with the share
 * of the first step and of the step before beside each.
 */
export function FunnelChart({ steps = [] }) {
  const first = steps[0]?.people || 0;
  if (!first) return <p className="py-6 text-center text-sm text-slate-400">No visits in this period yet</p>;
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => {
        const w = Math.max(3, (s.people / first) * 100);
        const weak = i > 0 && s.fromPrevious != null && s.fromPrevious < 30;
        return (
          <li key={s.key} className="grid grid-cols-[150px_1fr_120px] items-center gap-3 text-[13px] max-sm:grid-cols-[110px_1fr_90px]">
            <span className="font-medium text-slate-700">{s.label}</span>
            {s.notRecorded ? (
              <span className="flex h-9 items-center rounded-lg border border-dashed border-slate-200 px-3 text-[12px] text-slate-400">Recording started today</span>
            ) : (
              <span className="h-9 overflow-hidden rounded-lg bg-slate-100">
                <span className="flex h-full items-center rounded-lg px-3 text-[12.5px] font-semibold text-white tabular-nums"
                  style={{ width: `${w}%`, background: `linear-gradient(90deg, #1F4FD8, ${i ? '#3B6BEA' : '#1F4FD8'})`, opacity: 1 - i * 0.12 }}>
                  {count(s.people)}
                </span>
              </span>
            )}
            <span className="text-right text-[12px] tabular-nums text-slate-500">
              {i === 0 ? 'Start' : s.fromPrevious == null ? '—' : <><b className={weak ? 'text-rose-600' : 'text-slate-800'}>{s.fromPrevious}%</b> of previous</>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** One number in the live strip. */
function LiveStat({ label, value, tone = 'text-white' }) {
  return (
    <div className="min-w-[110px]">
      <p className={`text-[22px] font-semibold leading-none tabular-nums ${tone}`}>{count(value)}</p>
      <p className="mt-1 text-[11.5px] text-slate-400">{label}</p>
    </div>
  );
}

/** Right now, refreshed every 15 seconds: who is on the app and what is moving. */
export function LiveNow({ data }) {
  if (!data) return null;
  return (
    <section className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl bg-slate-900 px-5 py-4">
      <div className="flex items-center gap-2 pr-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </span>
        <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-300">Live now</span>
      </div>
      <LiveStat label="on the app" value={data.onApp} />
      <LiveStat label="in a booking" value={data.inBooking} tone="text-sky-300" />
      <LiveStat label="jobs in progress" value={data.jobsLive} />
      <LiveStat label="waiting for a provider" value={data.waitingForProvider} tone={data.waitingForProvider ? 'text-amber-300' : 'text-white'} />
      <LiveStat label="workers online" value={data.workersOnline} tone="text-emerald-300" />
      {data.stuck > 0 && <LiveStat label="past the time limit" value={data.stuck} tone="text-rose-300" />}
    </section>
  );
}

/** What changed, in sentences, at the top of a screen. */
export function Findings({ items = [] }) {
  if (!items.length) return null;
  const dot = { good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500' };
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map((f) => (
        <div key={f.text} className="flex items-start gap-2.5 rounded-xl border border-slate-200/70 bg-white px-3.5 py-2.5 text-[13px] leading-snug text-slate-700">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[f.tone] || 'bg-slate-400'}`} />
          {f.text}
        </div>
      ))}
    </div>
  );
}

/** A white panel with a title and an optional note on the right. */
export function Panel({ title, note, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200/70 bg-white p-5 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>
        {note && <p className="text-[11.5px] text-slate-400">{note}</p>}
      </div>
      {children}
    </section>
  );
}
