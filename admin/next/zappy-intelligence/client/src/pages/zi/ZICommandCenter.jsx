import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Zap, Activity, DollarSign, TrendingUp, CheckCircle,
  RefreshCw, AlertTriangle, Star, Clock, ChevronUp, ChevronDown,
} from 'lucide-react';
import { ziCommand } from './zi-api';

const POLL_INTERVAL = 10_000;

/* ── Currency helpers ──────────────────────────────────────────────────── */
function paiseToCurrency(paise) {
  const rupees = (paise || 0) / 100;
  if (rupees >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)}Cr`;
  if (rupees >= 1_00_000)    return `₹${(rupees / 1_00_000).toFixed(2)}L`;
  if (rupees >= 1_000)       return `₹${(rupees / 1_000).toFixed(1)}K`;
  return `₹${rupees.toFixed(0)}`;
}

function formatCurrency(amount) {
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`;
  if (amount >= 1_00_000)    return `₹${(amount / 1_00_000).toFixed(2)}L`;
  if (amount >= 1_000)       return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${(amount || 0).toFixed(0)}`;
}

function formatNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n || 0);
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/* ── Skeleton ──────────────────────────────────────────────────────────── */
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-slate-700/60 rounded-lg ${className}`} />;
}

/* ── Animated KPI number ───────────────────────────────────────────────── */
function AnimatedValue({ value, className = '' }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setDisplay(value);
    }
  }, [value]);

  return (
    <motion.span
      key={value}
      initial={{ y: -6, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      {display}
    </motion.span>
  );
}

/* ── KPI Card ──────────────────────────────────────────────────────────── */
function KPICard({ icon: Icon, label, value, sub, color, trend }) {
  const colorMap = {
    green:   { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'text-emerald-400', badge: 'text-emerald-400' },
    blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: 'text-blue-400',    badge: 'text-blue-400' },
    orange:  { bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  icon: 'text-orange-400',  badge: 'text-orange-400' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'text-emerald-400', badge: 'text-emerald-400' },
    purple:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  icon: 'text-violet-400',  badge: 'text-violet-400' },
    yellow:  { bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20',  icon: 'text-yellow-400',  badge: 'text-yellow-400' },
    red:     { bg: 'bg-red-500/10',     border: 'border-red-500/20',     icon: 'text-red-400',     badge: 'text-red-400' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`bg-slate-900 border ${c.border} rounded-xl p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend >= 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <div className="text-2xl font-bold text-white tracking-tight">
          <AnimatedValue value={value} />
        </div>
        <div className="text-slate-500 text-xs mt-1">{label}</div>
        {sub && <div className={`text-xs mt-0.5 ${c.badge}`}>{sub}</div>}
      </div>
    </div>
  );
}

/* ── Mini Area Chart (SVG) ─────────────────────────────────────────────── */
function AreaChart({ data = [], color = '#6366f1', height = 120, valueKey = 'value', labelKey = 'label' }) {
  if (!data.length) return <div className="h-full flex items-center justify-center text-slate-600 text-sm">No data</div>;

  const W = 600;
  const H = height;
  const PAD = { top: 10, right: 10, bottom: 28, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const vals = data.map((d) => Number(d[valueKey]) || 0);
  const maxV = Math.max(...vals) || 1;
  const minV = Math.min(...vals);
  const range = maxV - minV || 1;

  const xStep = innerW / Math.max(data.length - 1, 1);

  const pts = data.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top + innerH - ((Number(d[valueKey]) || 0) - minV) / range * innerH,
    label: d[labelKey],
    val: d[valueKey],
  }));

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${PAD.top + innerH} L ${pts[0].x} ${PAD.top + innerH} Z`;

  const gradId = `grad-${color.replace('#', '')}`;

  /* Y labels */
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = minV + (range * i) / yTicks;
    return { y: PAD.top + innerH - (i / yTicks) * innerH, v };
  });

  /* X labels — show max 6 */
  const xStep2 = Math.ceil(data.length / 6);
  const xLabels = pts.filter((_, i) => i % xStep2 === 0 || i === data.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {yLabels.map((t, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y} stroke="#1e293b" strokeWidth="1" />
          <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fill="#475569" fontSize="9">
            {formatCurrency(t.v)}
          </text>
        </g>
      ))}
      {/* Area fill */}
      <path d={areaD} fill={`url(#${gradId})`} />
      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {/* X labels */}
      {xLabels.map((p, i) => (
        <text key={i} x={p.x} y={H - 4} textAnchor="middle" fill="#475569" fontSize="9">
          {p.label}
        </text>
      ))}
      {/* Dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} opacity="0.8" />
      ))}
    </svg>
  );
}

/* ── Donut/Pie Chart (SVG) ─────────────────────────────────────────────── */
const PIE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c084fc', '#e879f9', '#f472b6', '#fb923c'];

function PieChart({ data = [], nameKey = 'name', valueKey = 'value' }) {
  if (!data.length) return <div className="flex items-center justify-center h-full text-slate-600 text-sm">No data</div>;

  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0) || 1;
  const R = 70;
  const CX = 90;
  const CY = 90;
  let cumAngle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const frac = (Number(d[valueKey]) || 0) / total;
    const angle = frac * 2 * Math.PI;
    const x1 = CX + R * Math.cos(cumAngle);
    const y1 = CY + R * Math.sin(cumAngle);
    cumAngle += angle;
    const x2 = CX + R * Math.cos(cumAngle);
    const y2 = CY + R * Math.sin(cumAngle);
    const large = angle > Math.PI ? 1 : 0;
    return {
      d: `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`,
      color: PIE_COLORS[i % PIE_COLORS.length],
      name: d[nameKey],
      pct: (frac * 100).toFixed(1),
      val: d[valueKey],
    };
  });

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 180 180" className="w-36 h-36 flex-shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.d} fill={s.color} stroke="#0f172a" strokeWidth="2" />
        ))}
        <circle cx={CX} cy={CY} r="40" fill="#0f172a" />
        <text x={CX} y={CY - 6} textAnchor="middle" fill="#94a3b8" fontSize="11">Total</text>
        <text x={CX} y={CY + 10} textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="bold">
          {formatNum(total)}
        </text>
      </svg>
      <div className="flex flex-col gap-1.5 text-xs min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-slate-400 truncate flex-1">{s.name}</span>
            <span className="text-slate-300 font-medium">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Alert severity ────────────────────────────────────────────────────── */
const SEVERITY_CLASSES = {
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  high:     'bg-orange-500/15 text-orange-300 border-orange-500/30',
  medium:   'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  low:      'bg-blue-500/15 text-blue-300 border-blue-500/30',
};

/* ── Status badge ──────────────────────────────────────────────────────── */
const STATUS_CLASSES = {
  completed:   'bg-emerald-500/15 text-emerald-300',
  pending:     'bg-yellow-500/15 text-yellow-300',
  in_progress: 'bg-blue-500/15 text-blue-300',
  cancelled:   'bg-red-500/15 text-red-300',
};

/* ── Health score circle ───────────────────────────────────────────────── */
function HealthCircle({ score }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
      <circle cx="18" cy="18" r="15" fill="none" stroke="#1e293b" strokeWidth="3" />
      <circle
        cx="18" cy="18" r="15"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={`${(score / 100) * 94.25} 94.25`}
        strokeLinecap="round"
      />
      <text
        x="18" y="22"
        textAnchor="middle"
        fill={color}
        fontSize="9"
        fontWeight="bold"
        className="rotate-90"
        style={{ transform: 'rotate(90deg)', transformOrigin: '18px 18px' }}
      >
        {score}
      </text>
    </svg>
  );
}

/* ── Main Component ────────────────────────────────────────────────────── */
export default function ZICommandCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await ziCommand.getLiveMetrics();
      setData(r.data);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to fetch live data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchData]);

  /* ── Derived values ── */
  const kpis = data?.kpis || {};
  const revenueByHour = data?.revenueByHour || [];
  const ordersByCategory = data?.ordersByCategory || [];
  const cities = data?.cities || [];
  const alerts = data?.alerts || [];
  const topWorkers = data?.topWorkers || [];
  const liveOrders = data?.liveOrders || [];

  const slaColor = kpis.slaCompliance >= 90 ? 'green' : kpis.slaCompliance >= 85 ? 'yellow' : 'red';

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
        <Skeleton className="h-40" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  /* ── Error state ── */
  if (error && !data) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <p className="text-slate-400">{error}</p>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm transition-all"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Command Center</h1>
          <p className="text-slate-500 text-sm mt-0.5">Live operational intelligence · auto-refreshes every 10s</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all text-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2.5 text-yellow-300 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Poll error: {error} — showing last known data
        </div>
      )}

      {/* ── Row 1: KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard icon={Users}       label="Active Users"    value={formatNum(kpis.activeUsers)}    color="green"   trend={kpis.activeUsersTrend} />
        <KPICard icon={Zap}         label="Active Workers"  value={formatNum(kpis.activeWorkers)}  color="blue"    trend={kpis.activeWorkersTrend} />
        <KPICard icon={Activity}    label="Live Orders"     value={formatNum(kpis.liveOrders)}     color="orange"  trend={kpis.liveOrdersTrend} />
        <KPICard icon={DollarSign}  label="Revenue Today"   value={paiseToCurrency(kpis.revenueToday)}  color="emerald" />
        <KPICard icon={TrendingUp}  label="Revenue MTD"     value={paiseToCurrency(kpis.revenueMtd)}    color="purple" />
        <KPICard
          icon={CheckCircle}
          label="SLA Compliance"
          value={`${kpis.slaCompliance ?? '—'}%`}
          color={slaColor}
          sub={kpis.slaCompliance >= 90 ? '✓ On target' : kpis.slaCompliance >= 85 ? '⚠ Near threshold' : '✗ Below SLA'}
        />
      </div>

      {/* ── Row 2: Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue by Hour */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Revenue by Hour (Today)</h3>
          <p className="text-xs text-slate-500 mb-4">Hourly GMV breakdown</p>
          <AreaChart
            data={revenueByHour}
            color="#6366f1"
            height={140}
            valueKey="revenue"
            labelKey="hour"
          />
        </div>

        {/* Orders by Category */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Orders by Category</h3>
          <p className="text-xs text-slate-500 mb-4">Distribution across service categories</p>
          <PieChart data={ordersByCategory} nameKey="category" valueKey="count" />
        </div>
      </div>

      {/* ── Row 3: City Health Grid ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">City Health Grid</h3>
        {cities.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-6">No city data available</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {cities.map((city) => (
              <div key={city.name} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-white text-xs font-semibold truncate">{city.name}</span>
                  <HealthCircle score={city.healthScore ?? 0} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Orders</span>
                    <span className="text-slate-300">{formatNum(city.orderCount)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Workers</span>
                    <span className="text-slate-300">{formatNum(city.workersOnline)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Row 4: Alerts + Top Workers ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alerts Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Active Alerts</h3>
            <span className="text-xs text-slate-500">{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
              <p className="text-slate-500 text-sm">No active alerts</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {alerts.map((alert, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${SEVERITY_CLASSES[alert.severity] || SEVERITY_CLASSES.low}`}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold capitalize">{alert.severity}</div>
                    <div className="mt-0.5 opacity-80 leading-relaxed">{alert.message}</div>
                    {alert.city && <div className="mt-1 opacity-60">{alert.city} · {timeAgo(alert.timestamp)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Workers */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top Workers Today</h3>
          {topWorkers.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-8">No worker data</p>
          ) : (
            <div className="space-y-2">
              {topWorkers.slice(0, 8).map((w, i) => (
                <div key={w.id || i} className="flex items-center gap-3 py-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? 'bg-yellow-500/20 text-yellow-300' : i === 1 ? 'bg-slate-400/20 text-slate-400' : i === 2 ? 'bg-orange-600/20 text-orange-400' : 'bg-slate-700 text-slate-500'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{w.name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {Array(5).fill(0).map((_, si) => (
                        <Star key={si} className={`w-2.5 h-2.5 ${si < Math.round(w.rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'}`} />
                      ))}
                      <span className="text-slate-500 text-xs ml-1">{(w.rating || 0).toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-white text-sm font-semibold">{w.jobsToday}</div>
                    <div className="text-slate-600 text-xs">jobs</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 5: Live Order Feed ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Live Order Feed</h3>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-slate-500">Live</span>
          </div>
        </div>
        {liveOrders.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-6">No recent orders</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['ID', 'Service', 'City', 'Status', 'Amount', 'Worker', 'Time'].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-slate-500 pb-3 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <AnimatePresence>
                  {liveOrders.map((order, i) => (
                    <motion.tr
                      key={order.id || i}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className="hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-2.5 pr-4 font-mono text-xs text-indigo-400">#{String(order.id).slice(-6)}</td>
                      <td className="py-2.5 pr-4 text-slate-300 truncate max-w-[120px]">{order.service}</td>
                      <td className="py-2.5 pr-4 text-slate-400">{order.city}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[order.status] || 'bg-slate-700 text-slate-400'}`}>
                          {order.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-emerald-400 font-medium">{formatCurrency(order.amount)}</td>
                      <td className="py-2.5 pr-4 text-slate-400 truncate max-w-[120px]">{order.workerName || '—'}</td>
                      <td className="py-2.5 text-slate-600 text-xs whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {order.timestamp ? timeAgo(order.timestamp) : '—'}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
