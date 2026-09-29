import { useState, useEffect } from 'react';
import { Building2, Play, Save, GitCompare } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { ziSimulator } from './zi-api';

const INDIAN_STATES = ['Andhra Pradesh','Bihar','Delhi','Gujarat','Haryana','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Punjab','Rajasthan','Tamil Nadu','Telangana','Uttar Pradesh','West Bengal'];

function fmt(paise) {
  const r = (paise || 0) / 100;
  if (r >= 10000000) return `₹${(r / 10000000).toFixed(1)}Cr`;
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  return `₹${r.toLocaleString('en-IN')}`;
}

function Slider({ label, value, min, max, step = 1, onChange, unit = '', display }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-slate-400">{label}</span>
        <span className="text-white font-semibold">{display || `${value}${unit}`}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500" />
    </div>
  );
}

export default function ZISimulator() {
  const [form, setForm] = useState({
    city: '',
    state: 'Telangana',
    population: 5000000,
    initialWorkers: 50,
    initialMarketingSpend: 500000,
    avgOrderValuePaise: 60000,
    targetPenetrationRate: 0.01,
    operationalCostPerOrderPaise: 8000,
    workerAcquisitionCost: 150000,
    userAcquisitionCost: 12000,
    commissionRate: 0.18,
  });
  const [scenarios, setScenarios] = useState(null);
  const [activeScenario, setActiveScenario] = useState('base');
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState([]);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('run');

  useEffect(() => {
    ziSimulator.list().then(r => setSaved(r.data || [])).catch(() => {});
  }, []);

  const run = async () => {
    if (!form.city) return alert('Enter city name');
    setRunning(true);
    try {
      const payload = {
        city: form.city,
        state: form.state,
        population: form.population,
        assumptions: {
          initialWorkers: form.initialWorkers,
          initialMarketingSpend: form.initialMarketingSpend,
          avgOrderValuePaise: form.avgOrderValuePaise,
          targetPenetrationRate: form.targetPenetrationRate,
          operationalCostPerOrderPaise: form.operationalCostPerOrderPaise,
          workerAcquisitionCost: form.workerAcquisitionCost,
          userAcquisitionCost: form.userAcquisitionCost,
          commissionRate: form.commissionRate,
        },
      };
      const r = await ziSimulator.runScenarios(payload);
      setScenarios(r.data);
    } catch (e) {
      alert(e.message);
    }
    setRunning(false);
  };

  const saveSimulation = async () => {
    if (!scenarios || !saveName) return;
    setSaving(true);
    try {
      await ziSimulator.save(scenarios[activeScenario], `${saveName} (${activeScenario})`);
      setSaveName('');
      const r = await ziSimulator.list();
      setSaved(r.data || []);
    } catch (e) {
      alert(e.message);
    }
    setSaving(false);
  };

  const activeData = scenarios?.[activeScenario]?.monthlyProjections || [];

  const chartData = activeData.map((m) => ({
    month: `M${m.month}`,
    revenue: Math.round((m.revenuePaise || 0) / 100),
    costs: Math.round(((m.costs?.total || 0)) / 100),
    cashflow: Math.round((m.cashflow || 0) / 100),
  }));

  const summary = scenarios?.[activeScenario];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">City Launch Simulator</h1>
        <p className="text-slate-400 text-sm mt-0.5">Monte Carlo financial projections for new city launches</p>
      </div>

      <div className="flex gap-2 border-b border-slate-800">
        {['run', 'saved'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'text-indigo-400 border-indigo-400' : 'text-slate-400 border-transparent hover:text-white'
            }`}>
            {t === 'run' ? 'Run Simulation' : 'Saved Simulations'}
          </button>
        ))}
      </div>

      {tab === 'run' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Form */}
          <div className="lg:col-span-2 bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-5">
            <h3 className="text-white font-semibold">City Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="text-slate-400 text-xs block mb-1.5">City Name</label>
                <input className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Jaipur" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1.5">State</label>
                <select className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                  value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <Slider label="Population" value={form.population} min={500000} max={20000000} step={500000}
                onChange={v => setForm(f => ({ ...f, population: v }))}
                display={`${(form.population / 100000).toFixed(1)}L`} />
              <Slider label="Initial Workers" value={form.initialWorkers} min={10} max={500}
                onChange={v => setForm(f => ({ ...f, initialWorkers: v }))} unit=" workers" />
              <Slider label="Marketing Budget" value={form.initialMarketingSpend} min={100000} max={5000000} step={100000}
                onChange={v => setForm(f => ({ ...f, initialMarketingSpend: v }))}
                display={`₹${(form.initialMarketingSpend / 100).toLocaleString('en-IN')}/mo`} />
              <Slider label="Avg Order Value" value={form.avgOrderValuePaise / 100} min={200} max={2000} step={50}
                onChange={v => setForm(f => ({ ...f, avgOrderValuePaise: v * 100 }))} unit="₹"
                display={`₹${form.avgOrderValuePaise / 100}`} />
              <Slider label="Target Penetration" value={form.targetPenetrationRate * 100} min={0.1} max={5} step={0.1}
                onChange={v => setForm(f => ({ ...f, targetPenetrationRate: v / 100 }))}
                display={`${(form.targetPenetrationRate * 100).toFixed(1)}%`} />
              <Slider label="Commission Rate" value={form.commissionRate * 100} min={10} max={30}
                onChange={v => setForm(f => ({ ...f, commissionRate: v / 100 }))}
                display={`${(form.commissionRate * 100).toFixed(0)}%`} />
            </div>

            <button onClick={run} disabled={running || !form.city}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors">
              <Play size={16} /> {running ? 'Running...' : 'Run Simulation'}
            </button>
          </div>

          {/* Results */}
          <div className="lg:col-span-3 space-y-4">
            {!scenarios ? (
              <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-xl h-64 flex items-center justify-center text-slate-500">
                Configure inputs and run simulation
              </div>
            ) : (
              <>
                {/* Scenario selector */}
                <div className="flex gap-2">
                  {['bear', 'base', 'bull'].map(s => (
                    <button key={s} onClick={() => setActiveScenario(s)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold capitalize transition-all ${
                        activeScenario === s
                          ? s === 'bear' ? 'bg-red-600 text-white' : s === 'bull' ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>

                {/* Summary cards */}
                {summary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
                      <div className="text-slate-400 text-[11px]">Break-even</div>
                      <div className="text-white font-black text-lg mt-1">
                        {summary.breakEvenMonth ? `Month ${summary.breakEvenMonth}` : 'N/A'}
                      </div>
                    </div>
                    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
                      <div className="text-slate-400 text-[11px]">Investment</div>
                      <div className="text-white font-black text-lg mt-1">{fmt(summary.totalInvestmentNeeded)}</div>
                    </div>
                    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
                      <div className="text-slate-400 text-[11px]">Yr1 GMV</div>
                      <div className="text-emerald-400 font-black text-lg mt-1">{fmt(summary.projectedYr1GMVPaise)}</div>
                    </div>
                    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 text-center">
                      <div className="text-slate-400 text-[11px]">Yr1 Revenue</div>
                      <div className="text-indigo-400 font-black text-lg mt-1">{fmt(summary.projectedYr1RevenuePaise)}</div>
                    </div>
                  </div>
                )}

                {/* Cashflow chart */}
                {chartData.length > 0 && (
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
                    <h4 className="text-white font-semibold mb-4">Monthly Cashflow</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                          labelStyle={{ color: '#e2e8f0' }}
                          formatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
                        <ReferenceLine y={0} stroke="#475569" />
                        <Bar dataKey="cashflow" radius={[4, 4, 0, 0]}>
                          {chartData.map((d, i) => <Cell key={i} fill={d.cashflow >= 0 ? '#22c55e' : '#ef4444'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Projection table */}
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-5 gap-2 px-4 py-2.5 bg-slate-800/80 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                    <span>Month</span><span>Users</span><span>GMV</span><span>Revenue</span><span>Cashflow</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {activeData.map((m) => (
                      <div key={m.month} className="grid grid-cols-5 gap-2 px-4 py-2 border-b border-slate-700/50 text-xs">
                        <span className="text-slate-300 font-medium">M{m.month}</span>
                        <span className="text-slate-300">{(m.users || 0).toLocaleString()}</span>
                        <span className="text-slate-300">{fmt(m.gmvPaise)}</span>
                        <span className="text-indigo-300">{fmt(m.revenuePaise)}</span>
                        <span className={m.cashflow >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(m.cashflow)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save */}
                <div className="flex gap-2">
                  <input className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    placeholder="Name this simulation..." value={saveName} onChange={e => setSaveName(e.target.value)} />
                  <button onClick={saveSimulation} disabled={saving || !saveName}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                    <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'saved' && (
        <div className="space-y-3">
          {saved.length === 0 ? (
            <div className="text-slate-500 text-center py-16">No saved simulations yet. Run a simulation and save it.</div>
          ) : (
            saved.map((s) => (
              <div key={s._id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-white font-medium">{s.name}</div>
                  <div className="text-slate-400 text-xs mt-0.5">{s.city}, {s.state} · {new Date(s.createdAt).toLocaleDateString('en-IN')}</div>
                </div>
                <div className="text-right">
                  <div className="text-emerald-400 font-bold">{fmt(s.projectedYr1RevenuePaise)}</div>
                  <div className="text-slate-400 text-xs">Yr1 Revenue</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold">{s.breakEvenMonth ? `M${s.breakEvenMonth}` : 'N/A'}</div>
                  <div className="text-slate-400 text-xs">Break-even</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
