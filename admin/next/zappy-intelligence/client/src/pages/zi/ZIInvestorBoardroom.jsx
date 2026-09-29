import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Download, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { ziInvestor } from './zi-api';

const PERIODS = ['mtd', 'qtd', 'ytd', 'last30d', 'last90d'];
const PERIOD_LABELS = { mtd: 'Month to Date', qtd: 'Quarter to Date', ytd: 'Year to Date', last30d: 'Last 30 Days', last90d: 'Last 90 Days' };

function fmt(paise) { return `₹${((paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }
function fmtCr(paise) {
  const r = (paise || 0) / 100;
  if (r >= 10000000) return `₹${(r / 10000000).toFixed(1)}Cr`;
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  return `₹${r.toLocaleString('en-IN')}`;
}

function GrowthBadge({ value }) {
  const pos = value >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-bold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(value || 0).toFixed(1)}%
    </span>
  );
}

export default function ZIInvestorBoardroom() {
  const [period, setPeriod] = useState('mtd');
  const [summary, setSummary] = useState(null);
  const [ue, setUe] = useState(null);
  const [cohorts, setCohorts] = useState([]);
  const [growth, setGrowth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      ziInvestor.getSummary(period),
      ziInvestor.getUnitEconomics(),
      ziInvestor.getCohorts(6),
      ziInvestor.getGrowth(),
    ]).then(([s, u, c, g]) => {
      setSummary(s.data);
      setUe(u.data);
      setCohorts(c.data || []);
      setGrowth(g.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  const generateReport = async () => {
    setReportLoading(true);
    try {
      const r = await ziInvestor.generateReport(period);
      setReport(r.data);
    } catch {}
    setReportLoading(false);
  };

  const Skeleton = ({ className = 'h-24' }) => (
    <div className={`animate-pulse bg-slate-800 rounded-xl ${className}`} />
  );

  const retentionColors = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#f8faff'];

  const cohortTableMonths = 6;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Investor Boardroom</h1>
          <p className="text-slate-400 text-sm mt-0.5">Board-grade metrics and investor-ready reports</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            {PERIODS.map(p => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
          </select>
          <button
            onClick={generateReport}
            disabled={reportLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Download size={14} /> {reportLoading ? 'Generating...' : 'Export Report'}
          </button>
          {!reportLoading && (
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-lg text-sm transition-colors">
              Print
            </button>
          )}
        </div>
      </div>

      {/* Top KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'GMV', value: fmtCr(summary?.gmvPaise), sub: `${(summary?.orders || 0).toLocaleString()} orders` },
            { label: 'Revenue', value: fmtCr(summary?.revenuePaise), sub: 'Net of returns' },
            { label: 'Active Users', value: (summary?.activeUsers || 0).toLocaleString(), sub: `${(summary?.newUsers || 0).toLocaleString()} new` },
            { label: 'Retention', value: `${Math.round(summary?.retention || 0)}%`, sub: 'Returning users', color: (summary?.retention || 0) >= 40 ? 'text-emerald-400' : 'text-amber-400' },
            { label: 'Avg Order', value: fmt(summary?.avgOrderValuePaise), sub: 'Per booking' },
            { label: 'Cities', value: summary?.cities || '—', sub: `${summary?.categories || 0} categories` },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
              <p className="text-slate-400 text-xs">{label}</p>
              <p className={`text-xl font-black mt-1 ${color || 'text-white'}`}>{value}</p>
              {sub && <p className="text-slate-500 text-[10px] mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Unit Economics */}
      {loading ? <Skeleton className="h-28" /> : ue && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Unit Economics</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'CAC', value: fmt(ue.cacPaise), color: 'text-white' },
              { label: 'LTV', value: fmt(ue.ltvPaise), color: 'text-white' },
              { label: 'LTV:CAC', value: `${(ue.ltvCacRatio || 0).toFixed(1)}x`, color: (ue.ltvCacRatio || 0) >= 3 ? 'text-emerald-400' : 'text-amber-400' },
              { label: 'Payback', value: `${Math.round(ue.paybackMonths || 0)} mo`, color: 'text-white' },
              { label: 'Gross Margin', value: `${Math.round(ue.grossMarginPct || 65)}%`, color: 'text-indigo-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center bg-slate-900/60 rounded-xl p-3">
                <div className="text-slate-400 text-xs">{label}</div>
                <div className={`text-2xl font-black mt-1 ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Growth Metrics */}
      {loading ? <Skeleton className="h-24" /> : growth && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Growth Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Orders WoW', wow: growth.orders?.wow, mom: growth.orders?.mom },
              { label: 'Revenue WoW', wow: growth.revenue?.wow, mom: growth.revenue?.mom },
              { label: 'Users WoW', wow: growth.users?.wow, mom: growth.users?.mom },
              { label: 'Workers WoW', wow: growth.workers?.wow, mom: growth.workers?.mom },
            ].map(({ label, wow, mom }) => (
              <div key={label} className="bg-slate-900/60 rounded-xl p-3">
                <div className="text-slate-400 text-xs mb-2">{label}</div>
                <div className="flex items-center gap-3">
                  <div>
                    <div className="text-slate-500 text-[10px]">WoW</div>
                    <GrowthBadge value={wow} />
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px]">MoM</div>
                    <GrowthBadge value={mom} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cohort Heatmap */}
      {cohorts.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-white font-semibold mb-4">Cohort Retention</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-slate-400 py-2 pr-4 font-medium">Cohort</th>
                  {Array.from({ length: cohortTableMonths }, (_, i) => (
                    <th key={i} className="text-center text-slate-400 py-2 px-2 font-medium">M+{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohortMonth}>
                    <td className="text-slate-300 py-1.5 pr-4 font-medium">{c.cohortMonth}</td>
                    {Array.from({ length: cohortTableMonths }, (_, mi) => {
                      const ret = c.retentionByMonth?.[mi] ?? null;
                      const intensity = ret != null ? ret / 100 : 0;
                      return (
                        <td key={mi} className="text-center py-1.5 px-2">
                          {ret != null ? (
                            <span
                              className="inline-block w-10 py-1 rounded text-[11px] font-bold"
                              style={{ backgroundColor: `rgba(99, 102, 241, ${intensity})`, color: intensity > 0.5 ? '#fff' : '#94a3b8' }}
                            >
                              {Math.round(ret)}%
                            </span>
                          ) : <span className="text-slate-700">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report Preview */}
      {report && (
        <div className="bg-slate-800/60 border border-indigo-500/20 rounded-xl p-5 space-y-3">
          <h3 className="text-white font-semibold">{report.title || 'Generated Report'}</h3>
          {report.executiveSummary && <p className="text-slate-300 text-sm leading-relaxed">{report.executiveSummary}</p>}
          {(report.sections || []).map((sec, i) => (
            <div key={i} className="bg-slate-900/60 rounded-xl p-4">
              <h4 className="text-indigo-300 font-semibold text-sm mb-2">{sec.title}</h4>
              <p className="text-slate-400 text-sm">{sec.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
