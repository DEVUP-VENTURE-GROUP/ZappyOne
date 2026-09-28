import { useState } from 'react';
import {
  Gift, Percent, Users, TrendingUp, ChevronDown, ChevronUp,
  RefreshCw, CheckCircle, Clock, AlertCircle, Wallet,
  BarChart2, Star, Award,
} from 'lucide-react';
import {
  useAdminGetCashbackConfigQuery,
  useAdminSetCashbackConfigMutation,
  useAdminGetCashbackStatsQuery,
  useAdminGetReferralStatsQuery,
  useAdminListRecentReferralsQuery,
  useAdminListDeferredMilestonesQuery,
  useAdminReleaseDeferredMilestoneMutation,
} from '@shared/services/api';
import { SectionHeader, Card, FormRow, Input, SaveBtn, PageLoader, StatCard } from './_shared';
import toast from 'react-hot-toast';

const DAYS_OPTIONS = [7, 14, 30, 90];

/* Stat summary card */
function MoneyCard({ label, value, sub, icon: Icon, color = 'text-emerald-600', bg = 'bg-emerald-50' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center shrink-0`}>
        <Icon size={22} className={color} />
      </div>
      <div>
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* Cashback section */
function CashbackConfig() {
  const { data, isLoading, refetch } = useAdminGetCashbackConfigQuery();
  const [save, { isLoading: saving }] = useAdminSetCashbackConfigMutation();

  const cfg = data?.config;
  const [form, setForm] = useState(null);

  // Populate form once data arrives, but only once
  if (cfg && !form) {
    setForm({
      enabled:             cfg.enabled ?? true,
      rate:                ((cfg.rate ?? 0.05) * 100).toFixed(0),
      capPaise:            Math.round((cfg.capPaise ?? 5000) / 100),
      firstOrderRate:      ((cfg.firstOrderRate ?? 0.10) * 100).toFixed(0),
      firstOrderThreshold: cfg.firstOrderThreshold ?? 3,
    });
  }

  async function handleSave() {
    try {
      await save({
        enabled:             form.enabled,
        rate:                Number(form.rate) / 100,
        capPaise:            Math.round(Number(form.capPaise) * 100),
        firstOrderRate:      Number(form.firstOrderRate) / 100,
        firstOrderThreshold: Number(form.firstOrderThreshold),
      }).unwrap();
      toast.success('Cashback config saved');
      refetch();
    } catch (err) {
      toast.error(err.data?.error || 'Save failed');
    }
  }

  if (isLoading || !form) return <PageLoader />;

  const f = (key) => ({
    value: form[key],
    onChange: (e) => setForm(p => ({ ...p, [key]: e.target.value })),
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Cashback Rules</h3>
          <p className="text-xs text-slate-400 mt-0.5">Credited to user wallet instantly on order completion</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs font-semibold text-slate-600">{form.enabled ? 'Enabled' : 'Disabled'}</span>
          <div
            onClick={() => setForm(p => ({ ...p, enabled: !p.enabled }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${form.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.enabled ? 'translate-x-5' : ''}`} />
          </div>
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <FormRow label="Base Cashback Rate (%)" hint="Applied to all eligible orders">
          <div className="flex items-center gap-2">
            <Input type="number" min="0" max="30" step="1" {...f('rate')} />
            <span className="text-sm font-bold text-slate-600 w-8">%</span>
          </div>
        </FormRow>
        <FormRow label="Max Cashback Cap (₹)" hint="Maximum cashback per order">
          <Input type="number" min="0" step="1" {...f('capPaise')} />
        </FormRow>
        <FormRow label="First-Order Cashback Rate (%)" hint="Higher rate for new users' first N orders">
          <div className="flex items-center gap-2">
            <Input type="number" min="0" max="50" step="1" {...f('firstOrderRate')} />
            <span className="text-sm font-bold text-slate-600 w-8">%</span>
          </div>
        </FormRow>
        <FormRow label="First-Order Threshold" hint="Apply bonus rate to orders 1 through N">
          <Input type="number" min="1" max="10" step="1" {...f('firstOrderThreshold')} />
        </FormRow>
      </div>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        <SaveBtn loading={saving} onClick={handleSave}>Save Cashback Config</SaveBtn>
      </div>
    </div>
  );
}

/* Cashback analytics */
function CashbackStats() {
  const [days, setDays] = useState(30);
  const { data, isLoading, refetch } = useAdminGetCashbackStatsQuery(days);

  if (isLoading) return <PageLoader />;

  const d = data || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Period:</span>
        <div className="flex gap-1.5">
          {DAYS_OPTIONS.map((opt) => (
            <button key={opt} onClick={() => setDays(opt)}
              className={`px-3 py-1 text-xs rounded-full font-semibold transition-colors ${days === opt ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {opt}d
            </button>
          ))}
        </div>
        <button onClick={refetch} className="ml-auto text-slate-400 hover:text-slate-700 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MoneyCard label="Total Cashback Paid" value={`₹${d.totalRupees?.toLocaleString() ?? 0}`} sub={`${d.totalCount ?? 0} orders`} icon={Wallet} />
        <MoneyCard label="Avg per Order" value={`₹${Math.round((d.avgPaise ?? 0) / 100)}`} icon={Percent} color="text-blue-600" bg="bg-blue-50" />
        <MoneyCard label="Orders with Cashback" value={d.totalCount ?? 0} icon={CheckCircle} color="text-violet-600" bg="bg-violet-50" />
        <MoneyCard label="Period" value={`${days} days`} icon={BarChart2} color="text-amber-600" bg="bg-amber-50" />
      </div>

      {/* Day-by-day sparkline table */}
      {d.byDay?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Daily Cashback</p>
          </div>
          <div className="divide-y divide-slate-50">
            {d.byDay.slice(-10).reverse().map((row) => (
              <div key={row.day} className="flex items-center px-5 py-2.5 text-sm">
                <span className="text-slate-500 w-28 shrink-0 text-xs">{row.day}</span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full mx-3">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${Math.min(100, (row.totalPaise / (d.byDay.reduce((m, x) => Math.max(m, x.totalPaise), 1) || 1)) * 100)}%` }}
                  />
                </div>
                <span className="font-semibold text-slate-700 w-16 text-right">₹{row.totalRupees}</span>
                <span className="text-slate-400 text-xs w-16 text-right">{row.count} orders</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Referral analytics */
function ReferralStats() {
  const [days, setDays] = useState(30);
  const { data: stats, isLoading: loadingStats, refetch } = useAdminGetReferralStatsQuery(days);
  const { data: recent, isLoading: loadingRecent } = useAdminListRecentReferralsQuery({ page: 1 });
  const [showRecent, setShowRecent] = useState(false);

  const s = stats || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Period:</span>
        <div className="flex gap-1.5">
          {DAYS_OPTIONS.map((opt) => (
            <button key={opt} onClick={() => setDays(opt)}
              className={`px-3 py-1 text-xs rounded-full font-semibold transition-colors ${days === opt ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {opt}d
            </button>
          ))}
        </div>
        <button onClick={refetch} className="ml-auto text-slate-400 hover:text-slate-700 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {loadingStats ? <PageLoader /> : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MoneyCard label="Referral Signups" value={s.totalSignups ?? 0} icon={Users} color="text-violet-600" bg="bg-violet-50" />
          <MoneyCard label="Converted (1st Order)" value={s.converted ?? 0} sub={`${s.conversionPct ?? 0}% conversion`} icon={CheckCircle} />
          <MoneyCard label="Total Reward Spend" value={`₹${s.totalSpendRupees?.toLocaleString() ?? 0}`} icon={Gift} color="text-pink-600" bg="bg-pink-50" />
          <MoneyCard label="Avg Cost per Signup" value={s.totalSignups ? `₹${Math.round((s.totalSpendRupees ?? 0) / s.totalSignups)}` : '—'} icon={TrendingUp} color="text-amber-600" bg="bg-amber-50" />
        </div>
      )}

      {/* Top referrers */}
      {s.topReferrers?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Top Referrers</p>
          </div>
          <div className="divide-y divide-slate-50">
            {s.topReferrers.map((r, i) => (
              <div key={String(r.referrerId)} className="flex items-center px-5 py-3 text-sm">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                  {i + 1}
                </span>
                <span className="font-mono text-xs text-slate-400 flex-1 truncate">{String(r.referrerId)}</span>
                <span className="text-slate-700 font-semibold mr-4">{r.signups} signups</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.converted === r.signups ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {r.converted}/{r.signups} converted
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent referrals toggle */}
      <button
        onClick={() => setShowRecent(!showRecent)}
        className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
      >
        {showRecent ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {showRecent ? 'Hide' : 'Show'} recent referral log
      </button>
      {showRecent && (
        loadingRecent ? <PageLoader /> : (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {(recent?.uses || []).map((u) => (
                <div key={u._id} className="flex items-center px-5 py-2.5 text-xs gap-3">
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${u.status === 'rewarded' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {u.status}
                  </span>
                  <span className="font-mono text-slate-400 flex-1 truncate">Code: {u.code}</span>
                  <span className="text-slate-500">{new Date(u.createdAt).toLocaleDateString('en-IN')}</span>
                </div>
              ))}
              {!recent?.uses?.length && <p className="text-center text-slate-400 py-8 text-sm">No referrals found</p>}
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* Deferred milestones */
function DeferredMilestones() {
  const { data, isLoading, refetch } = useAdminListDeferredMilestonesQuery();
  const [release, { isLoading: releasing }] = useAdminReleaseDeferredMilestoneMutation();

  async function handleRelease(workerId, milestone, bonusPaise) {
    if (!window.confirm(`Release ₹${bonusPaise / 100} milestone #${milestone} to worker ${workerId}?`)) return;
    try {
      await release({ workerId, milestone }).unwrap();
      toast.success(`₹${bonusPaise / 100} released to worker`);
      refetch();
    } catch (err) {
      toast.error(err.data?.error || 'Release failed');
    }
  }

  if (isLoading) return <PageLoader />;

  const items = data?.deferred || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800">Deferred Milestone Bonuses</p>
          <p className="text-xs text-slate-400 mt-0.5">Workers whose rating was below 3.5 when they hit a milestone — held pending rating improvement</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${items.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
          {items.length} pending
        </span>
      </div>
      {items.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">
          <Award size={28} className="mx-auto mb-2 text-slate-300" />
          No deferred milestones — all workers received their bonuses
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {items.map((item) => (
            <div key={item.key} className="flex items-center px-5 py-3.5 gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Star size={16} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-slate-400 truncate">Worker: {item.workerId}</p>
                <p className="text-sm font-semibold text-slate-800">
                  Milestone #{item.milestone} — ₹{item.bonusPaise / 100}
                </p>
                <p className="text-xs text-slate-400">Deferred on {item.deferredAt ? new Date(item.deferredAt).toLocaleDateString('en-IN') : '—'}</p>
              </div>
              <button
                onClick={() => handleRelease(item.workerId, item.milestone, item.bonusPaise)}
                disabled={releasing}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Release
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Main page */
export default function Rewards() {
  const [activeTab, setActiveTab] = useState('cashback');

  const TABS = [
    { id: 'cashback',   label: 'Cashback',   icon: Percent },
    { id: 'referrals',  label: 'Referrals',  icon: Users   },
    { id: 'milestones', label: 'Milestones', icon: Award   },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Rewards & Incentives"
        subtitle="Configure cashback rules, track referral performance, and manage deferred milestone bonuses"
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'cashback' && (
        <div className="space-y-6">
          <CashbackConfig />
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              <BarChart2 size={15} className="text-emerald-500" />
              Cashback Analytics
            </h3>
            <CashbackStats />
          </div>
        </div>
      )}

      {activeTab === 'referrals' && (
        <div className="space-y-5">
          <ReferralStats />
        </div>
      )}

      {activeTab === 'milestones' && (
        <div className="space-y-5">
          <DeferredMilestones />
        </div>
      )}
    </div>
  );
}
