import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertTriangle, Users, Bug, Flame, Pause, Play, X, Send, Loader2, ServerCrash, MonitorX, Wifi, Code2,
  ArrowUpRight, ArrowDownRight, Smartphone, ClipboardList, RotateCcw,
} from 'lucide-react';
import {
  useAdminErrorPulseQuery, useAdminErrorLiveQuery, useAdminErrorIssuesQuery, useAdminErrorIssueQuery,
  useAdminPlanErrorIssueMutation, useAdminMessageErrorIssueMutation,
} from '@shared/services/api';
import { SectionHeader, Card, PageLoader, EmptyState } from '../../ui/kit';

/**
 * Live errors — what real people are hitting right now, in every app.
 *
 *   pulse    errors this hour against the last, people affected, open issues,
 *            P0s, and a minute-by-minute line for the hour
 *   live     the newest errors as they land (every few seconds), each with who
 *            it happened to, their role, the app, the screen and the device
 *   issues   the same fault grouped once: how often, how many people, which
 *            roles, a 24 h line, and its fix plan
 *   issue    stack, the requests that failed, the people affected; plan the
 *            fix (priority, owner, steps, ETA, status) and message the people
 *
 * Data: server telemetry/errors (capture from all five apps + the API).
 */

const ROLE = {
  user: ['Customer', 'bg-blue-50 text-blue-700'], worker: ['Worker', 'bg-violet-50 text-violet-700'],
  shop: ['Shop', 'bg-amber-50 text-amber-800'], event_partner: ['Event partner', 'bg-pink-50 text-pink-700'],
  admin: ['Admin', 'bg-slate-800 text-white'], guest: ['Signed out', 'bg-slate-100 text-slate-600'],
};
const KIND = {
  crash: ['Screen crash', MonitorX, 'text-red-600'], js: ['App error', Code2, 'text-orange-600'],
  api: ['Request failed', Wifi, 'text-amber-600'], server: ['Server error', ServerCrash, 'text-red-700'],
};
const STATUS = {
  open: 'bg-red-50 text-red-700', planned: 'bg-blue-50 text-blue-700', fixing: 'bg-violet-50 text-violet-700',
  resolved: 'bg-emerald-50 text-emerald-700', ignored: 'bg-slate-100 text-slate-500',
};
const PRIORITY = { P0: 'bg-red-600 text-white', P1: 'bg-orange-500 text-white', P2: 'bg-slate-200 text-slate-700', P3: 'bg-slate-100 text-slate-500' };
const APP_LABEL = { zappyone: 'Customer', www: 'Customer', zappy: 'Customer', localhost: 'Local', rakshak: 'Rakshak', servicepro: 'ServicePro', events: 'Events', admin: 'Admin', api: 'API' };

const ago = (d) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(d)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const appName = (a) => APP_LABEL[a] || a || 'Unknown';

function RoleChip({ role }) {
  const [label, tone] = ROLE[role] || ROLE.guest;
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>;
}
function KindTag({ kind }) {
  const [label, Icon, tone] = KIND[kind] || KIND.js;
  return <span className={`inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold ${tone}`}><Icon size={13} /> {label}</span>;
}

/* ------------------------------------------------------------------ */

export default function LiveErrors() {
  const [tab, setTab] = useState('live');
  const [filters, setFilters] = useState({ role: '', app: '', kind: '', severity: '' });
  const [openIssue, setOpenIssue] = useState(null);
  const { data: pulse, isLoading } = useAdminErrorPulseQuery(undefined, { pollingInterval: 15000 });

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: f[k] === v ? '' : v }));

  if (isLoading) return <PageLoader />;
  const change = pulse && pulse.prevHour ? Math.round(((pulse.lastHour - pulse.prevHour) / pulse.prevHour) * 100) : null;

  return (
    <div className="space-y-5">
      <SectionHeader title="Live errors" subtitle="What customers, workers, shops and partners are hitting right now, grouped, with a plan for each">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
          Live
        </span>
      </SectionHeader>

      {pulse && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi Icon={Flame} label="Errors, last hour" value={pulse.lastHour} tone="text-red-600 bg-red-50"
            sub={change == null ? 'no errors the hour before' : (
              <span className={`inline-flex items-center gap-0.5 ${change > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {change > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(change)}% vs hour before
              </span>
            )} />
          <Kpi Icon={Users} label="People affected, last hour" value={pulse.peopleLastHour} tone="text-blue-600 bg-blue-50" sub="signed-in people who saw an error" />
          <Kpi Icon={Bug} label="Open issues" value={pulse.openIssues} tone="text-violet-600 bg-violet-50" sub="open, planned or being fixed" />
          <Kpi Icon={AlertTriangle} label="New today" value={pulse.newToday} tone="text-amber-600 bg-amber-50" sub="never seen before today" />
          <Kpi Icon={Activity} label="P0 not fixed" value={pulse.p0} tone={pulse.p0 ? 'text-white bg-red-600' : 'text-slate-600 bg-slate-100'} sub="highest priority" />
        </div>
      )}

      {pulse && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-700">Errors per minute, last hour</p>
            <p className="text-[11.5px] text-slate-400">{pulse.perMinute.reduce((a, r) => a + r.n, 0)} in all</p>
          </div>
          <MinuteBars rows={pulse.perMinute} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Last 24 h by who</span>
            {Object.entries(ROLE).map(([k, [label]]) => (
              <FilterChip key={k} on={filters.role === k} onClick={() => set('role', k)} label={label} n={pulse.byRole[k] || 0} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">By app</span>
            {Object.entries(pulse.byApp).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <FilterChip key={k} on={filters.app === k} onClick={() => set('app', k)} label={appName(k)} n={n} />
            ))}
            <span className="mx-1 h-4 w-px bg-slate-200" />
            {Object.entries(KIND).map(([k, [label]]) => (
              <FilterChip key={k} on={filters.kind === k} onClick={() => set('kind', k)} label={label} />
            ))}
            <FilterChip on={filters.severity === 'error'} onClick={() => set('severity', 'error')} label="Errors only (hide warnings)" />
          </div>
        </Card>
      )}

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {[['live', 'Live feed'], ['issues', 'Issues & plans']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
        ))}
      </div>

      {tab === 'live' ? <LiveFeed filters={filters} onOpen={setOpenIssue} /> : <IssueList filters={filters} onOpen={setOpenIssue} />}

      <AnimatePresence>{openIssue && <IssueDrawer id={openIssue} onClose={() => setOpenIssue(null)} />}</AnimatePresence>
    </div>
  );
}

function Kpi({ Icon, label, value, sub, tone }) {
  return (
    <Card className="p-4">
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={17} /></span>
      <p className="mt-2 text-[24px] font-black tabular-nums text-slate-900">{value}</p>
      <p className="text-[12px] font-semibold text-slate-600">{label}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>
    </Card>
  );
}

function FilterChip({ on, onClick, label, n }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>
      {label}{n != null && <span className={`tabular-nums ${on ? 'text-white/70' : 'text-slate-400'}`}>{n}</span>}
    </button>
  );
}

/** Sixty bars, one a minute; empty minutes stay visible so a spike reads as a spike. */
function MinuteBars({ rows }) {
  const bars = useMemo(() => {
    const by = new Map(rows.map((r) => [new Date(r.at).setSeconds(0, 0), r.n]));
    const now = new Date(); now.setSeconds(0, 0);
    return Array.from({ length: 60 }, (_, i) => {
      const t = now.getTime() - (59 - i) * 60000;
      return { t, n: by.get(t) || 0 };
    });
  }, [rows]);
  const max = Math.max(1, ...bars.map((b) => b.n));
  return (
    <div className="flex h-20 items-end gap-[2px]">
      {bars.map((b) => (
        <div key={b.t} title={`${new Date(b.t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}: ${b.n}`}
          className={`flex-1 rounded-sm ${b.n ? (b.n / max > 0.6 ? 'bg-red-500' : 'bg-red-300') : 'bg-slate-100'}`}
          style={{ height: `${b.n ? Math.max(8, (b.n / max) * 100) : 6}%` }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LiveFeed({ filters, onOpen }) {
  const [paused, setPaused] = useState(false);
  const [rows, setRows] = useState([]);
  const newest = useRef(null);
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));

  // First load: the latest 60. Then only what is newer, every 4 seconds.
  const { data: first, isFetching } = useAdminErrorLiveQuery({ ...params, limit: 60 });
  useEffect(() => { if (first) { setRows(first); newest.current = first[0]?.at || new Date().toISOString(); } }, [first]);
  const { data: fresh } = useAdminErrorLiveQuery(
    { ...params, since: newest.current, limit: 50 },
    { skip: paused || !newest.current, pollingInterval: paused ? 0 : 4000 },
  );
  useEffect(() => {
    if (!fresh?.length) return;
    newest.current = fresh[0].at;
    setRows((r) => [...fresh, ...r].slice(0, 200));
  }, [fresh]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-[13px] font-semibold text-slate-700">{paused ? 'Paused' : 'Newest first, updating every few seconds'}</p>
        <button type="button" onClick={() => setPaused((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">
          {paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
        </button>
      </div>
      {isFetching && !rows.length ? <PageLoader /> : !rows.length ? (
        <EmptyState message="No errors. Everyone is getting through." icon={Activity} />
      ) : (
        <ul className="divide-y divide-slate-100">
          <AnimatePresence initial={false}>
            {rows.map((e) => (
              <motion.li key={e._id} layout initial={{ opacity: 0, backgroundColor: '#fef2f2' }} animate={{ opacity: 1, backgroundColor: '#ffffff' }}
                transition={{ duration: 1.2 }}>
                <button type="button" onClick={() => onOpen(e.issueId)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.severity === 'error' ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <KindTag kind={e.kind} />
                      <RoleChip role={e.role} />
                      {e.who && <span className="text-[12px] font-semibold text-slate-800">{e.who.name}{e.who.phone ? `, ${e.who.phone}` : ''}</span>}
                      <span className="text-[11.5px] text-slate-400">{appName(e.app)}</span>
                    </span>
                    <span className="mt-1 block truncate text-[13.5px] font-medium text-slate-900">{e.message}</span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-slate-500">
                      <span className="font-mono">{e.api?.url ? `${e.api.method} ${e.api.url.split('?')[0]} → ${e.api.status || e.api.code}` : e.path}</span>
                      {e.device && <span className="inline-flex items-center gap-1"><Smartphone size={11} /> {e.device}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">{ago(e.at)}</span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Spark({ data }) {
  const max = Math.max(1, ...data);
  return (
    <span className="flex h-6 w-24 items-end gap-px">
      {data.map((n, i) => <span key={i} className={`flex-1 rounded-[1px] ${n ? 'bg-red-400' : 'bg-slate-100'}`} style={{ height: `${n ? Math.max(15, (n / max) * 100) : 10}%` }} />)}
    </span>
  );
}

function IssueList({ filters, onOpen }) {
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState('recent');
  const [q, setQ] = useState('');
  const params = { ...Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && k !== 'severity')), status, sort, ...(q.trim() && { q: q.trim() }) };
  const { data, isFetching } = useAdminErrorIssuesQuery(params, { pollingInterval: 15000 });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        {[['active', 'Needs work'], ['resolved', 'Resolved'], ['ignored', 'Ignored'], ['all', 'All']].map(([k, label]) => (
          <FilterChip key={k} on={status === k} onClick={() => setStatus(k)} label={label} />
        ))}
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="ml-auto rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]">
          <option value="recent">Latest first</option><option value="count">Most often</option><option value="people">Most people</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search message" className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px]" />
      </div>
      {isFetching && !data ? <PageLoader /> : !data?.length ? <EmptyState message="No issues here." icon={Bug} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-2">Issue</th><th className="px-3 py-2">Who</th><th className="px-3 py-2 text-right">Times</th><th className="px-3 py-2 text-right">People</th><th className="px-3 py-2">24 h</th><th className="px-3 py-2">Last</th><th className="px-3 py-2">Plan</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((i) => (
                <tr key={i._id} onClick={() => onOpen(i._id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="max-w-[380px] px-4 py-3">
                    <div className="flex items-center gap-2"><KindTag kind={i.kind} /><span className="text-[11px] text-slate-400">{appName(i.app)}</span>
                      {i.cameBack && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10.5px] font-bold text-red-700"><RotateCcw size={10} /> came back</span>}
                    </div>
                    <p className="mt-1 truncate font-semibold text-slate-900">{i.title}</p>
                    <p className="truncate font-mono text-[11px] text-slate-500">{i.where}</p>
                  </td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{i.roles.map((r) => <RoleChip key={r} role={r} />)}</div></td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">{i.count.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{i.peopleCount}</td>
                  <td className="px-3 py-3"><Spark data={i.spark} /></td>
                  <td className="px-3 py-3 text-[12px] text-slate-500">{ago(i.lastSeen)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${PRIORITY[i.plan?.priority || 'P2']}`}>{i.plan?.priority || 'P2'}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS[i.status]}`}>{i.status}</span>
                    </div>
                    {i.plan?.owner && <p className="mt-0.5 text-[11px] text-slate-500">{i.plan.owner}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

const TEMPLATES = [
  ['Fixed — please try again', 'Sorry about the trouble earlier. We have fixed it. Please open the app and try again.'],
  ['We are on it', 'We noticed something went wrong for you. Our team is fixing it now and will let you know.'],
  ['Need your help', 'Something went wrong for you earlier. Could you reply in Help so we can sort it out with you?'],
];

function IssueDrawer({ id, onClose }) {
  const { data, isLoading } = useAdminErrorIssueQuery(id);
  const [savePlan, { isLoading: saving }] = useAdminPlanErrorIssueMutation();
  const [sendMsg, { isLoading: sending }] = useAdminMessageErrorIssueMutation();
  const [plan, setPlan] = useState(null);
  const [msg, setMsg] = useState({ to: 'all', title: TEMPLATES[0][0], body: TEMPLATES[0][1] });

  useEffect(() => {
    if (data) setPlan({ status: data.status, priority: data.plan?.priority || 'P2', owner: data.plan?.owner || '', steps: data.plan?.steps || '', eta: data.plan?.eta ? String(data.plan.eta).slice(0, 10) : '' });
  }, [data]);

  async function save(extra = {}) {
    try {
      await savePlan({ id, ...plan, ...extra, eta: (extra.eta ?? plan.eta) || null }).unwrap();
      toast.success('Plan saved');
    } catch (err) { toast.error(err?.data?.error || 'Could not save'); }
  }
  async function send() {
    try { const r = await sendMsg({ id, ...msg }).unwrap(); toast.success(r.message); } catch (err) { toast.error(err?.data?.error || 'Could not send'); }
  }

  const first = data?.events?.[0];
  return (
    <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.aside onClick={(e) => e.stopPropagation()} initial={{ x: 60 }} animate={{ x: 0 }} exit={{ x: 60 }}
        className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl">
        {isLoading || !data || !plan ? <PageLoader /> : (
          <div className="space-y-5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><KindTag kind={data.kind} /><span className="text-[12px] text-slate-400">{appName(data.app)}</span>
                  {data.roles.map((r) => <RoleChip key={r} role={r} />)}</div>
                <h2 className="mt-2 text-[18px] font-bold text-slate-900">{data.title}</h2>
                <p className="font-mono text-[12px] text-slate-500">{data.where}</p>
                <p className="mt-1 text-[12px] text-slate-500">
                  {data.count.toLocaleString('en-IN')} times, {data.people.length} people, first {ago(data.firstSeen)}, last {ago(data.lastSeen)}
                </p>
              </div>
              <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
            </div>

            {/* The plan: who fixes it, how, by when. */}
            <section className="rounded-2xl border border-slate-200 p-4">
              <p className="flex items-center gap-2 text-[14px] font-bold text-slate-900"><ClipboardList size={16} /> Fix plan</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <label className="text-[12px] font-semibold text-slate-600">Status
                  <select value={plan.status} onChange={(e) => setPlan({ ...plan, status: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-[13px]">
                    {['open', 'planned', 'fixing', 'resolved', 'ignored'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select></label>
                <label className="text-[12px] font-semibold text-slate-600">Priority
                  <select value={plan.priority} onChange={(e) => setPlan({ ...plan, priority: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-[13px]">
                    <option value="P0">P0, stops people now</option><option value="P1">P1, today</option><option value="P2">P2, this week</option><option value="P3">P3, later</option>
                  </select></label>
                <label className="text-[12px] font-semibold text-slate-600">Owner
                  <input value={plan.owner} onChange={(e) => setPlan({ ...plan, owner: e.target.value })} placeholder="Who fixes it" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-[13px]" /></label>
                <label className="text-[12px] font-semibold text-slate-600">Fix by
                  <input type="date" value={plan.eta} onChange={(e) => setPlan({ ...plan, eta: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-[13px]" /></label>
              </div>
              <textarea value={plan.steps} onChange={(e) => setPlan({ ...plan, steps: e.target.value })} rows={4}
                placeholder={'Cause, the fix, how we check it worked, who to tell.\n1. …'} className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => save()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />} Save plan</button>
                <button type="button" onClick={() => { setPlan({ ...plan, status: 'resolved' }); save({ status: 'resolved' }); }} className="rounded-lg border border-emerald-300 px-4 py-2 text-[13px] font-semibold text-emerald-700">Mark resolved</button>
                {data.plan?.updatedBy && <span className="text-[11.5px] text-slate-400">Last updated by {data.plan.updatedBy} {ago(data.plan.updatedAt)}</span>}
              </div>
              <p className="mt-2 text-[11.5px] text-slate-400">A resolved issue that happens again reopens by itself, marked “came back”.</p>
            </section>

            {/* Message the people it happened to. */}
            <section className="rounded-2xl border border-slate-200 p-4">
              <p className="flex items-center gap-2 text-[14px] font-bold text-slate-900"><Send size={15} /> Message the people affected</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TEMPLATES.map(([t, b]) => <FilterChip key={t} on={msg.title === t} onClick={() => setMsg({ ...msg, title: t, body: b })} label={t} />)}
              </div>
              <select value={msg.to} onChange={(e) => setMsg({ ...msg, to: e.target.value })} className="mt-3 w-full rounded-lg border border-slate-200 px-2 py-2 text-[13px]">
                <option value="all">Everyone affected ({data.people.length})</option>
                {data.people.map((p) => <option key={`${p.role}:${p.userId}`} value={`${p.role}:${p.userId}`}>{(ROLE[p.role] || ROLE.guest)[0]}, {p.name || p.userId}{p.phone ? `, ${p.phone}` : ''}</option>)}
              </select>
              <input value={msg.title} onChange={(e) => setMsg({ ...msg, title: e.target.value })} maxLength={80} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold" />
              <textarea value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} maxLength={300} rows={3} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]" />
              <button type="button" onClick={send} disabled={sending || !data.people.length} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send as app notification
              </button>
              {!data.people.length && <p className="mt-1 text-[11.5px] text-slate-400">Only signed-in people can be messaged; this one happened to signed-out visitors.</p>}
              {data.messaged?.length > 0 && (
                <ul className="mt-3 space-y-1 text-[11.5px] text-slate-500">
                  {data.messaged.slice(-5).reverse().map((m, i) => <li key={i}>“{m.title}” to {m.to === 'all' ? 'everyone' : m.to}, {m.by}, {ago(m.at)}</li>)}
                </ul>
              )}
            </section>

            {first?.stack && (
              <section>
                <p className="mb-1.5 text-[13px] font-bold text-slate-900">Where it broke</p>
                <pre className="max-h-64 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{first.stack}{first.componentStack ? `\n\nScreen:\n${first.componentStack}` : ''}</pre>
              </section>
            )}

            <section>
              <p className="mb-1.5 text-[13px] font-bold text-slate-900">Latest occurrences</p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {data.events.map((e) => (
                  <li key={e._id} className="flex items-start gap-3 px-3 py-2.5 text-[12px]">
                    <RoleChip role={e.role} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-800">{e.who ? `${e.who.name}${e.who.phone ? `, ${e.who.phone}` : ''}` : 'Signed-out visitor'}</span>
                      <span className="block truncate font-mono text-[11px] text-slate-500">{e.api?.url ? `${e.api.method} ${e.api.url} → ${e.api.status || e.api.code}${e.api.requestId ? `, ${e.api.requestId}` : ''}` : e.path}</span>
                      <span className="block text-[11px] text-slate-400">{e.device}{e.release ? `, build ${e.release}` : ''}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-400">{ago(e.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </motion.aside>
    </motion.div>
  );
}
