import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { RefreshCw, AlertCircle, CheckCircle, ChevronDown } from 'lucide-react';

import { ziForecasting } from './zi-api';

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function formatRupees(paise) {
  const rs = paise / 100;
  if (rs >= 1e7) return `₹${(rs / 1e7).toFixed(2)}Cr`;
  if (rs >= 1e5) return `₹${(rs / 1e5).toFixed(2)}L`;
  if (rs >= 1e3) return `₹${(rs / 1e3).toFixed(1)}K`;
  return `₹${rs.toFixed(0)}`;
}

const CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata'];
const CATEGORIES = ['All', 'Cleaning', 'Plumbing', 'Electrical', 'Carpentry', 'Painting', 'Pest Control'];
const HORIZONS = ['7d', '30d', '90d'];

function SkeletonRow({ cols = 4 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-700 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function SkeletonChart() {
  return (
    <div className="h-72 bg-slate-800 rounded-xl animate-pulse flex items-center justify-center">
      <span className="text-slate-600 text-sm">Loading chart…</span>
    </div>
  );
}

function ErrorBox({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <AlertCircle className="w-8 h-8 text-red-400" />
      <p className="text-slate-300 text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function Dropdown({ value, onChange, options, label }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm hover:border-indigo-500 transition-colors min-w-[140px]"
      >
        <span className="text-slate-400 text-xs">{label}:</span>
        <span className="flex-1 text-left">{value}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute z-50 top-full mt-1 left-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-full overflow-hidden"
          >
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-700 transition-colors ${value === opt ? 'text-indigo-400' : 'text-slate-200'}`}
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const CustomDemandTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const predicted = payload.find(p => p.dataKey === 'predicted');
  const upper = payload.find(p => p.dataKey === 'upper');
  const lower = payload.find(p => p.dataKey === 'lower');
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl text-sm">
      <p className="text-slate-300 font-medium mb-2">{label}</p>
      {predicted && <p className="text-indigo-400">Predicted: <span className="text-white font-semibold">{predicted.value?.toLocaleString()} orders</span></p>}
      {upper && lower && (
        <p className="text-slate-400">Range: {lower.value?.toLocaleString()} – {upper.value?.toLocaleString()}</p>
      )}
    </div>
  );
};

const CustomRevenueTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl text-sm">
      <p className="text-slate-300 font-medium mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="text-white font-semibold">{formatRupees(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

function DemandForecastTab({ city, category, horizon }) {
  const [demandData, setDemandData] = useState(null);
  const [workerData, setWorkerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      ziForecasting.getDemand(city, category === 'All' ? '' : category, parseInt(horizon)),
      ziForecasting.getWorkerDemand(city),
    ])
      .then(([demand, worker]) => {
        setDemandData(demand.data);
        setWorkerData(worker.data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [city, category, horizon]);

  useEffect(() => { load(); }, [load]);

  const chartData = demandData?.predictions
    ? demandData.predictions.map(p => ({
        date: formatDate(p.date),
        predicted: p.value,
        upper: p.upper,
        lower: p.lower,
      }))
    : [];

  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      {loading ? (
        <SkeletonChart />
      ) : (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h3 className="text-slate-200 font-semibold mb-4">Demand Forecast — {horizon}</h3>
          <ResponsiveContainer width="100%" height={288}>
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="upperGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomDemandTooltip />} />
              <Area type="monotone" dataKey="upper" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" fill="url(#upperGrad)" fillOpacity={0.1} name="Upper Bound" />
              <Area type="monotone" dataKey="predicted" stroke="#6366f1" strokeWidth={2} fill="url(#predGrad)" fillOpacity={0.3} name="Predicted" />
              <Area type="monotone" dataKey="lower" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" fill="url(#upperGrad)" fillOpacity={0.1} name="Lower Bound" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h3 className="text-slate-200 font-semibold">Worker Demand — Next 7 Days</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left px-5 py-3 text-slate-400 font-medium">Skill</th>
              <th className="text-right px-5 py-3 text-slate-400 font-medium">Needed</th>
              <th className="text-right px-5 py-3 text-slate-400 font-medium">Available</th>
              <th className="text-right px-5 py-3 text-slate-400 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={4} />)
              : workerData?.length === 0
              ? (
                <tr>
                  <td colSpan={4} className="text-center text-slate-500 py-8">No worker demand data</td>
                </tr>
              )
              : workerData?.map((row, i) => {
                  const gap = row.needed - row.available;
                  const gapColor = gap > 10 ? 'text-red-400' : gap >= 1 ? 'text-yellow-400' : 'text-emerald-400';
                  return (
                    <tr key={i} className="hover:bg-slate-700/40 transition-colors">
                      <td className="px-5 py-3 text-slate-200 font-medium">{row.skill}</td>
                      <td className="px-5 py-3 text-right text-slate-300">{row.needed}</td>
                      <td className="px-5 py-3 text-right text-slate-300">{row.available}</td>
                      <td className={`px-5 py-3 text-right font-semibold ${gapColor}`}>
                        {gap > 0 ? `+${gap}` : gap}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RevenueForecastTab({ city, category, horizon }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    ziForecasting.getRevenue(city, parseInt(horizon))
      .then(r => setData(r.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [city, category, horizon]);

  useEffect(() => { load(); }, [load]);

  const chartData = data?.base
    ? data.base.map((b, i) => ({
        date: formatDate(b.date),
        bear: data.bear[i]?.revenuePaise || 0,
        base: b.revenuePaise || 0,
        bull: data.bull[i]?.revenuePaise || 0,
      }))
    : [];

  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <h3 className="text-slate-200 font-semibold mb-4">Revenue Scenarios — {horizon}</h3>
      {loading ? (
        <SkeletonChart />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => formatRupees(v)} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
            <Tooltip content={<CustomRevenueTooltip />} />
            <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 13 }} />
            <Line type="monotone" dataKey="bear" stroke="#ef4444" strokeWidth={2} dot={false} name="Bear" />
            <Line type="monotone" dataKey="base" stroke="#6366f1" strokeWidth={2.5} dot={false} name="Base" />
            <Line type="monotone" dataKey="bull" stroke="#22c55e" strokeWidth={2} dot={false} name="Bull" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function AccuracyPanel({ city, category }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retraining, setRetraining] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastRetrained, setLastRetrained] = useState(null);

  const loadAccuracy = useCallback(() => {
    setLoading(true);
    setError(null);
    ziForecasting.getAccuracy(city)
      .then(r => setData(r.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [city, category]);

  useEffect(() => { loadAccuracy(); }, [loadAccuracy]);

  const handleRetrain = async () => {
    setRetraining(true);
    try {
      await ziForecasting.triggerRetrain(city);
      const now = new Date();
      setLastRetrained(now);
      setToast({ type: 'success', msg: 'Model retrain queued successfully' });
    } catch (err) {
      setToast({ type: 'error', msg: err.message });
    } finally {
      setRetraining(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const mapeColor = data
    ? data.mape < 10 ? 'text-emerald-400' : data.mape < 20 ? 'text-yellow-400' : 'text-red-400'
    : 'text-slate-400';

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-900/60 border border-emerald-700 text-emerald-300' : 'bg-red-900/60 border border-red-700 text-red-300'}`}
          >
            {toast.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h3 className="text-slate-200 font-semibold mb-4">Accuracy Metrics</h3>
        {error ? (
          <ErrorBox message={error} onRetry={loadAccuracy} />
        ) : loading ? (
          <div className="space-y-3">
            {['MAE', 'MAPE', 'RMSE'].map(m => (
              <div key={m}>
                <div className="flex justify-between text-xs text-slate-500 mb-1"><span>{m}</span></div>
                <div className="h-5 bg-slate-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">MAE</span>
              <span className="text-slate-200 font-semibold">{data.mae?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">MAPE</span>
              <span className={`font-semibold ${mapeColor}`}>{data.mape?.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">RMSE</span>
              <span className="text-slate-200 font-semibold">{data.rmse?.toFixed(2)}</span>
            </div>
            <div className="pt-2 border-t border-slate-700">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-emerald-400 font-medium">●</span><span className="text-slate-400">MAPE &lt;10% = Good</span>
              </div>
              <div className="flex items-center gap-2 text-xs mt-1">
                <span className="text-yellow-400 font-medium">●</span><span className="text-slate-400">10–20% = Acceptable</span>
              </div>
              <div className="flex items-center gap-2 text-xs mt-1">
                <span className="text-red-400 font-medium">●</span><span className="text-slate-400">&gt;20% = Poor</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <h3 className="text-slate-200 font-semibold mb-3">Model Retraining</h3>
        {lastRetrained && (
          <p className="text-slate-400 text-xs mb-3">
            Last retrained: {lastRetrained.toLocaleString('en-IN')}
          </p>
        )}
        <button
          onClick={handleRetrain}
          disabled={retraining}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${retraining ? 'animate-spin' : ''}`} />
          {retraining ? 'Queuing…' : 'Retrain Model'}
        </button>
      </div>
    </div>
  );
}

export default function ZIForecasting() {
  const [city, setCity] = useState('Bengaluru');
  const [category, setCategory] = useState('All');
  const [horizon, setHorizon] = useState('7d');
  const [activeTab, setActiveTab] = useState('demand');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <div className="max-w-screen-xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Demand Forecasting</h1>
          <p className="text-slate-400 text-sm mt-1">AI-powered demand and revenue predictions</p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <Dropdown value={city} onChange={setCity} options={CITIES} label="City" />
          <Dropdown value={category} onChange={setCategory} options={CATEGORIES} label="Category" />
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-1 gap-1">
            {HORIZONS.map(h => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  horizon === h
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs + Side Panel */}
        <div className="flex gap-6 items-start">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Tab bar */}
            <div className="flex border-b border-slate-700 mb-6">
              {[
                { key: 'demand', label: 'Demand Forecast' },
                { key: 'revenue', label: 'Revenue Forecast' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-5 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                    activeTab === tab.key
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18 }}
              >
                {activeTab === 'demand' ? (
                  <DemandForecastTab city={city} category={category} horizon={horizon} />
                ) : (
                  <RevenueForecastTab city={city} category={category} horizon={horizon} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Side panel */}
          <div className="w-72 flex-shrink-0">
            <AccuracyPanel city={city} category={category} />
          </div>
        </div>
      </div>
    </div>
  );
}
