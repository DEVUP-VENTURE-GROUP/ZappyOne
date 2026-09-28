import { useState, Fragment } from 'react';
import {
  useAdminShieldSummaryQuery,
  useAdminShieldWeeksQuery,
  useAdminShieldWeekPayoutsQuery,
  useAdminShieldFeesQuery,
  useAdminShieldPendingSummaryQuery,
  useAdminShieldFeeScheduleQuery,
  useAdminShieldTriggerPayoutMutation,
  useAdminShieldWriteOffFeeMutation,
  useAdminShieldUpdateFeeScheduleMutation,
} from '@shared/services/api';
import {
  SectionHeader, StatCard, Card, Th, Td, StatusBadge,
  Pagination, EmptyState, PageLoader, fmt, fmtDate, SaveBtn,
} from './_shared';
import {
  Shield, TrendingUp, Users, AlertTriangle, Clock,
  Zap, ChevronDown, ChevronRight, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

/* Tabs */
const TABS = ['Overview', 'Weekly Funds', 'Fee Records', 'Fee Schedule'];

/* Helpers */
function pct(n) { return `${n ?? 0}%`; }

function HarmBadge({ score }) {
  const map = { 0: 'bg-slate-100 text-slate-500', 1: 'bg-yellow-100 text-yellow-700', 2: 'bg-orange-100 text-orange-700', 3: 'bg-red-100 text-red-700', 5: 'bg-red-200 text-red-800' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${map[score] ?? 'bg-slate-100 text-slate-500'}`}>
      {score} pts
    </span>
  );
}

/* Stage label */
function StageLabel({ stage }) {
  const map = {
    created:    { label: 'Pre-search',  cls: 'bg-slate-100 text-slate-600' },
    searching:  { label: 'Searching',   cls: 'bg-yellow-100 text-yellow-700' },
    assigned:   { label: 'Assigned',    cls: 'bg-blue-100 text-blue-700' },
    on_the_way: { label: 'On the way',  cls: 'bg-indigo-100 text-indigo-700' },
    arrived:    { label: 'Arrived',     cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[stage] ?? { label: stage, cls: 'bg-slate-100 text-slate-500' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{label}</span>;
}

/* Overview tab */
function OverviewTab() {
  const { data: summary, isFetching } = useAdminShieldSummaryQuery();
  const { data: pending }             = useAdminShieldPendingSummaryQuery();
  const [trigger, { isLoading: triggering }] = useAdminShieldTriggerPayoutMutation();

  async function handleTrigger() {
    if (!window.confirm('Run weekly payout now for all closed weeks? This distributes fund to workers immediately.')) return;
    try {
      const res = await trigger().unwrap();
      const paid = res.results?.filter(r => r.status === 'paid_out').length ?? 0;
      toast.success(`Payout complete — ${paid} week(s) processed`);
    } catch (err) {
      toast.error(err.data?.error || 'Payout failed');
    }
  }

  if (!summary) return <PageLoader />;

  const cw = summary.currentWeek ?? {};

  return (
    <div className="space-y-5">
      {/* stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="This week collected"
          value={fmt(cw.totalCollectedPaise ?? 0)}
          Icon={Shield}
          color="text-indigo-600" bg="bg-indigo-50"
          sub={`${cw.status === 'open' ? 'Accumulating — pays out Monday' : cw.status}`}
        />
        <StatCard
          label="Workers' pool (85%)"
          value={fmt(summary.allTimeWorkerPoolPaise ?? 0)}
          Icon={Users}
          color="text-green-600" bg="bg-green-50"
          sub="All-time paid to workers"
        />
        <StatCard
          label="Platform cut (15%)"
          value={fmt(summary.allTimePlatformCutPaise ?? 0)}
          Icon={TrendingUp}
          color="text-blue-600" bg="bg-blue-50"
          sub="All-time operational share"
        />
        <StatCard
          label="Pending fees"
          value={`${pending?.pendingCount ?? 0}`}
          Icon={Clock}
          color="text-amber-600" bg="bg-amber-50"
          sub={`${fmt(pending?.totalPendingPaise ?? 0)} across ${pending?.uniqueUsersCount ?? 0} users`}
        />
      </div>

      {/* current week breakdown */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Current week fund</h3>
            <p className="text-xs text-slate-400 mt-0.5">Resets every Monday 08:00 IST after payout</p>
          </div>
          <SaveBtn loading={triggering} onClick={handleTrigger}>
            <RefreshCw size={13} /> Run payout now
          </SaveBtn>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total collected', value: fmt(cw.totalCollectedPaise ?? 0) },
            { label: `Workers' share (${cw.splitWorkerPct ?? 85}%)`, value: fmt(Math.round((cw.totalCollectedPaise ?? 0) * ((cw.splitWorkerPct ?? 85) / 100))) },
            { label: `Platform share (${cw.splitPlatformPct ?? 15}%)`, value: fmt(Math.round((cw.totalCollectedPaise ?? 0) * ((cw.splitPlatformPct ?? 15) / 100))) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 rounded-xl p-4">
              <p className="text-xl font-extrabold text-slate-900 tabular-nums">{value}</p>
              <p className="text-xs text-slate-400 font-semibold mt-1">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* how it works */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-3">How the fund works</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            { step: '1', title: 'User cancels', desc: 'Fee assessed based on stage & repeat behaviour (₹0–₹75)' },
            { step: '2', title: 'Fee collected', desc: 'Deducted from wallet instantly, or deferred to next booking' },
            { step: '3', title: 'Fund pools', desc: 'All fees go into the weekly Shield Fund — 85% workers, 15% platform' },
            { step: '4', title: 'Monday payout', desc: 'Workers receive proportional share based on harm score' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-black flex items-center justify-center shrink-0">{step}</div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* Weekly funds tab */
function WeeklyFundsTab() {
  const [page, setPage]       = useState(1);
  const [filter, setFilter]   = useState('');
  const [expanded, setExpanded] = useState(null);

  const { data, isFetching } = useAdminShieldWeeksQuery({ page, status: filter || undefined });
  const { data: payoutsData }  = useAdminShieldWeekPayoutsQuery(expanded, { skip: !expanded });

  const STATUS_OPTS = ['', 'open', 'paid_out', 'skipped'];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_OPTS.map(s => (
          <button key={s || 'all'}
            onClick={() => { setFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition capitalize ${filter === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 bg-indigo-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Week</Th><Th>Collected</Th><Th>Workers (85%)</Th><Th>Platform (15%)</Th><Th>Status</Th><Th>Payout date</Th><Th>Workers paid</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.weeks?.map(week => (
                <Fragment key={week._id}>
                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <Td mono>
                      <p className="font-semibold text-slate-800">{fmtDate(week.weekStart)}</p>
                      <p className="text-[11px] text-slate-400">→ {fmtDate(week.weekEnd)}</p>
                    </Td>
                    <Td><span className="font-bold">{fmt(week.totalCollectedPaise)}</span></Td>
                    <Td><span className="text-green-700 font-semibold">{fmt(week.workerPoolPaise)}</span></Td>
                    <Td><span className="text-blue-700 font-semibold">{fmt(week.platformCutPaise)}</span></Td>
                    <Td><StatusBadge status={week.status === 'paid_out' ? 'completed' : week.status} /></Td>
                    <Td muted>{week.paidOutAt ? fmtDate(week.paidOutAt) : '—'}</Td>
                    <Td>{week.payoutsCount ?? 0} workers</Td>
                    <Td>
                      {week.status === 'paid_out' && (
                        <button
                          onClick={() => setExpanded(expanded === week._id ? null : week._id)}
                          className="text-indigo-600 hover:text-indigo-800 transition"
                        >
                          {expanded === week._id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                      )}
                    </Td>
                  </tr>

                  {/* Expandable worker payout breakdown */}
                  {expanded === week._id && (
                    <tr>
                      <td colSpan={8} className="bg-indigo-50/40 px-6 py-4">
                        <p className="text-xs font-bold text-slate-600 mb-2">Worker payouts this week</p>
                        {!payoutsData ? (
                          <p className="text-xs text-slate-400">Loading…</p>
                        ) : payoutsData.payouts?.length === 0 ? (
                          <p className="text-xs text-slate-400">No worker payouts recorded</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {payoutsData.payouts.map(p => (
                              <div key={p._id} className="bg-white rounded-lg border border-slate-100 px-3 py-2 flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{p.worker?.name ?? 'Worker'}</p>
                                  <p className="text-xs text-slate-400">{p.cancellationsCount} cancel{p.cancellationsCount !== 1 ? 's' : ''} · <HarmBadge score={p.harmScore} /></p>
                                </div>
                                <p className="text-sm font-bold text-green-700">{fmt(p.amountPaise)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}

              {!isFetching && !data?.weeks?.length && (
                <tr><td colSpan={8}><EmptyState message="No weekly fund records yet" icon={Shield} /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {data?.total > 0 && (
          <div className="px-4 py-3 border-t border-slate-100">
            <Pagination page={page} total={data.total} limit={20} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
          </div>
        )}
      </Card>
    </div>
  );
}

/* Fee Records tab */
function FeeRecordsTab() {
  const [page, setPage]       = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [writeOff, { isLoading: writingOff }] = useAdminShieldWriteOffFeeMutation();

  const STATUS_OPTS = [
    '', 'pending_next_order', 'collected_wallet', 'collected_next_order', 'grace', 'zero_fee', 'written_off',
  ];

  const { data, isFetching, refetch } = useAdminShieldFeesQuery({
    page,
    status: statusFilter || undefined,
  });

  async function handleWriteOff(id) {
    if (!window.confirm('Write off this pending fee? The user will not be charged.')) return;
    try {
      await writeOff(id).unwrap();
      toast.success('Fee written off');
      refetch();
    } catch (err) {
      toast.error(err.data?.error || 'Failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_OPTS.map(s => (
          <button key={s || 'all'}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition capitalize ${statusFilter === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {s ? s.replace(/_/g, ' ') : 'All'}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 bg-indigo-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Order</Th><Th>User</Th><Th>Worker</Th><Th>Stage</Th><Th>Fee</Th><Th>Harm</Th><Th>Collection</Th><Th>Date</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.fees?.map(fee => (
                <tr key={fee._id} className="hover:bg-slate-50/60 transition-colors">
                  <Td mono>#{String(fee.orderId?._id ?? fee.orderId).slice(-8)}</Td>
                  <Td>
                    <p className="font-semibold text-slate-900">{fee.userId?.name ?? '—'}</p>
                    <p className="text-xs text-slate-400">{fee.userId?.phone}</p>
                  </Td>
                  <Td muted>{fee.workerId?.name ?? <span className="text-slate-300">—</span>}</Td>
                  <Td><StageLabel stage={fee.cancelledAtStage} /></Td>
                  <Td>
                    {fee.isGrace
                      ? <span className="text-xs text-slate-400 font-semibold">Grace (₹0)</span>
                      : <span className="font-bold text-slate-900">{fmt(fee.feePaise)}</span>
                    }
                  </Td>
                  <Td><HarmBadge score={fee.harmScore} /></Td>
                  <Td>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      fee.collectionStatus === 'collected_wallet' || fee.collectionStatus === 'collected_next_order'
                        ? 'bg-green-100 text-green-700'
                        : fee.collectionStatus === 'pending_next_order'
                        ? 'bg-amber-100 text-amber-700'
                        : fee.collectionStatus === 'grace' || fee.collectionStatus === 'zero_fee'
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-red-100 text-red-600'
                    }`}>
                      {(fee.collectionStatus ?? '—').replace(/_/g, ' ')}
                    </span>
                  </Td>
                  <Td muted>{fmtDate(fee.createdAt)}</Td>
                  <Td>
                    {fee.collectionStatus === 'pending_next_order' && (
                      <button
                        disabled={writingOff}
                        onClick={() => handleWriteOff(fee._id)}
                        className="text-xs text-red-500 hover:text-red-700 font-semibold transition"
                      >
                        Write off
                      </button>
                    )}
                  </Td>
                </tr>
              ))}

              {!isFetching && !data?.fees?.length && (
                <tr><td colSpan={9}><EmptyState message="No fee records found" icon={Shield} /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        {data?.total > 0 && (
          <div className="px-4 py-3 border-t border-slate-100">
            <Pagination page={page} total={data.total} limit={50} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
          </div>
        )}
      </Card>
    </div>
  );
}

/* Fee Schedule tab */
function FeeScheduleTab() {
  const { data, refetch } = useAdminShieldFeeScheduleQuery();
  const [updateSchedule, { isLoading: saving }] = useAdminShieldUpdateFeeScheduleMutation();

  // Local editable state — initialised from server data
  const [fees, setFees]       = useState(null); // { searching:[0,1500,2500], ... }
  const [harm, setHarm]       = useState(null); // { searching:1, ... }
  const [workerPct, setWorkerPct]     = useState(null);
  const [dirty, setDirty]     = useState(false);

  // Sync from server once loaded
  const remote = data;
  const liveFees = fees ?? remote?.feeSchedule ?? {};
  const liveHarm = harm ?? remote?.harmScores  ?? {};
  const liveWorkerPct   = workerPct   ?? remote?.defaultSplit?.workerPct   ?? 85;
  const livePlatformPct = 100 - liveWorkerPct;

  function setFeeCell(stage, tierIdx, rupees) {
    const paise = Math.max(0, Math.round(Number(rupees) || 0)) * 100;
    setFees(prev => {
      const base = prev ?? remote?.feeSchedule ?? {};
      const row  = [...(base[stage] ?? [0, 0, 0])];
      row[tierIdx] = paise;
      return { ...base, [stage]: row };
    });
    setDirty(true);
  }

  function setHarmCell(stage, pts) {
    setHarm(prev => ({ ...(prev ?? remote?.harmScores ?? {}), [stage]: Math.max(0, Math.round(Number(pts) || 0)) }));
    setDirty(true);
  }

  async function handleSave() {
    try {
      await updateSchedule({
        feeSchedule:      liveFees,
        harmScores:       liveHarm,
        splitWorkerPct:   liveWorkerPct,
        splitPlatformPct: livePlatformPct,
      }).unwrap();
      toast.success('Fee schedule saved');
      setDirty(false);
      setFees(null); setHarm(null); setWorkerPct(null);
      refetch();
    } catch (err) {
      toast.error(err.data?.error || 'Save failed');
    }
  }

  const STAGES = [
    { key: 'searching',  label: 'Searching (no worker yet)' },
    { key: 'assigned',   label: 'Assigned (worker en route)' },
    { key: 'on_the_way', label: 'On the way' },
    { key: 'arrived',    label: 'Arrived at location' },
  ];

  const HARM_DESCS = {
    searching:  'Worker lost queue position',
    assigned:   'Worker committed but not yet moving',
    on_the_way: 'Worker already travelling — wasted time & fuel',
    arrived:    'Worker at doorstep — maximum harm',
  };

  return (
    <div className="space-y-5">
      {/* save bar */}
      {dirty && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">You have unsaved changes</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setFees(null); setHarm(null); setWorkerPct(null); setDirty(false); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition"
            >
              Discard
            </button>
            <SaveBtn loading={saving} onClick={handleSave}>Save changes</SaveBtn>
          </div>
        </div>
      )}

      {/* fee table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Cancellation fee schedule</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Enter amounts in ₹. Tiers based on user's cancellations in the last 30 days.
            1st searching cancel is always <strong>₹0 + warning</strong> (not editable).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Stage at cancellation</Th>
                <Th>1st cancel (30 days)</Th>
                <Th>2nd cancel (30 days)</Th>
                <Th>3rd+ cancel (30 days)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {STAGES.map(({ key, label }) => {
                const row = liveFees[key] ?? [0, 0, 0];
                return (
                  <tr key={key} className="hover:bg-slate-50/30">
                    <Td>
                      <div className="flex items-center gap-2">
                        <StageLabel stage={key} />
                        <span className="text-xs text-slate-500">{label}</span>
                      </div>
                    </Td>
                    {[0, 1, 2].map(i => {
                      const isGraceCell = key === 'searching' && i === 0;
                      return (
                        <td key={i} className="px-4 py-2.5">
                          {isGraceCell ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                                ₹0 — Grace
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 w-24">
                              <span className="text-sm text-slate-400 font-semibold">₹</span>
                              <input
                                type="number"
                                min="0"
                                max="1000"
                                value={Math.round(row[i] / 100)}
                                onChange={e => setFeeCell(key, i, e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition tabular-nums"
                              />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* harm score table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Harm scores (fund distribution weights)</h3>
          <p className="text-xs text-slate-400 mt-0.5">Higher score = larger share of Monday's payout. Affects proportional distribution only.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Stage</Th><Th>Harm points</Th><Th>Meaning</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {STAGES.map(({ key }) => (
                <tr key={key} className="hover:bg-slate-50/30">
                  <Td><StageLabel stage={key} /></Td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={liveHarm[key] ?? 0}
                      onChange={e => setHarmCell(key, e.target.value)}
                      className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition tabular-nums text-center"
                    />
                  </td>
                  <Td muted>{HARM_DESCS[key]}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* fund split */}
      <Card className="p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-4">Fund split</h3>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
              <Users size={18} className="text-green-700" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold mb-1">Workers' share (%)</p>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={liveWorkerPct}
                  onChange={e => {
                    const v = Math.min(100, Math.max(50, Number(e.target.value) || 85));
                    setWorkerPct(v);
                    setDirty(true);
                  }}
                  className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xl font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 transition tabular-nums text-center"
                />
                <span className="text-sm text-slate-500 font-bold">%</span>
              </div>
            </div>
          </div>

          <div className="text-slate-300 text-xl font-light">+</div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <Zap size={18} className="text-blue-700" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-semibold mb-1">Platform share (%)</p>
              <p className="text-xl font-extrabold text-slate-900 tabular-nums py-1.5 px-2">{livePlatformPct}%</p>
            </div>
          </div>

          <div className="text-slate-300 text-xl font-light">=</div>
          <p className="text-xl font-extrabold text-slate-900">100%</p>
        </div>
        {liveWorkerPct + livePlatformPct !== 100 && (
          <p className="text-xs text-red-500 mt-2 font-semibold">Must sum to 100%</p>
        )}
        <p className="text-xs text-slate-400 mt-3">
          Changes apply from the next weekly cycle. Existing paid-out weeks are not affected.
        </p>
      </Card>

      {!dirty && (
        <div className="flex justify-end">
          <SaveBtn loading={false} onClick={() => setDirty(true)}>Edit schedule</SaveBtn>
        </div>
      )}
    </div>
  );
}

/* Root component */
export default function ShieldFund() {
  const [tab, setTab] = useState('Overview');

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Worker Cancellation Shield Fund"
        subtitle="Collects cancellation fees and distributes them to affected workers every Monday"
      >
        <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
          <Shield size={13} className="text-indigo-600" />
          <span className="text-xs font-bold text-indigo-700">Shield Fund</span>
        </div>
      </SectionHeader>

      {/* tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* content */}
      {tab === 'Overview'      && <OverviewTab />}
      {tab === 'Weekly Funds'  && <WeeklyFundsTab />}
      {tab === 'Fee Records'   && <FeeRecordsTab />}
      {tab === 'Fee Schedule'  && <FeeScheduleTab />}
    </div>
  );
}
