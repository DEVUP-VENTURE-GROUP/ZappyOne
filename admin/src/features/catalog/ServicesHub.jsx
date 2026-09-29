import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Layers, Plus, ChevronRight, ArrowLeft, Pencil, Users, Clock, CircleDot, Loader2, X, Wrench,
} from 'lucide-react';
import {
  useAdminServicesOverviewQuery, useAdminOnboardingCreateMutation, useAdminOnboardingUpdateMutation,
} from '@shared/services/api';
import ImageUploadField from '@shared/components/common/ImageUploadField';
import { PageLoader, EmptyState } from '../../ui/kit';

const RepairVertical = lazy(() => import('./repair/RepairVertical'));
const Pet = lazy(() => import('./pet/PetConsole'));
const Helping = lazy(() => import('./helping/HelpingConsole'));

const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Where a service stands for customers — one label, derived the same way the customer catalog decides. */
function statusOf(line) {
  if (line.isActive === false) return { text: 'Hidden', tone: 'bg-slate-100 text-slate-500' };
  if (line.liveForCustomers) return { text: 'Live for customers', tone: 'bg-emerald-50 text-emerald-700' };
  if (line.status === 'live') return { text: 'Live — no approved provider yet', tone: 'bg-amber-50 text-amber-700' };
  return { text: 'Coming soon', tone: 'bg-slate-100 text-slate-600' };
}

/**
 * Admin → Services. Domains (Electronics, Vehicles, …) → the services inside →
 * that service's own console. Everything here is data: a new domain or service
 * is added from this screen, not in code.
 */
export default function ServicesHub() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading, refetch } = useAdminServicesOverviewQuery();
  const domainCode = params.get('d');
  const lineCode = params.get('s');
  const go = (next) => setParams({ tab: params.get('tab') || 'services', ...next });

  if (isLoading) return <PageLoader />;
  const domains = data?.domains || [];
  const domain = domains.find((d) => d.code === domainCode);
  const line = domain?.lines.find((l) => l.code === lineCode);

  if (line) return <ConsoleView domain={domain} line={line} onBack={() => go({ d: domain.code })} />;
  if (domain) return <DomainView domain={domain} onBack={() => go({})} onOpen={(l) => go({ d: domain.code, s: l.code })} onChanged={refetch} />;
  return <DomainsView domains={domains} onOpen={(d) => go({ d: d.code })} onChanged={refetch} />;
}

function Header({ title, subtitle, onBack, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      {onBack && (
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 hover:bg-slate-50" aria-label="Back">
          <ArrowLeft size={16} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Stat({ Icon, children }) {
  return <span className="flex items-center gap-1 text-xs text-slate-500"><Icon size={12} className="text-slate-400" />{children}</span>;
}

/* Level 1 — domains */
function DomainsView({ domains, onOpen, onChanged }) {
  const [editing, setEditing] = useState(null);
  return (
    <div>
      <Header title="Services" subtitle="Pick a domain to see and manage the services inside it.">
        <button onClick={() => setEditing({})} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          <Plus size={15} /> Add domain
        </button>
      </Header>
      {editing && <DomainForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
      {!domains.length ? <EmptyState message="No domains yet — add the first one" icon={Layers} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {domains.map((d) => (
            <button key={d._id} onClick={() => onOpen(d)} className="group overflow-hidden rounded-2xl bg-white text-left ring-1 ring-slate-200 transition hover:ring-indigo-300">
              <div className="flex h-24 items-center justify-center bg-slate-50">
                {d.imageUrl ? <img src={d.imageUrl} alt="" className="h-full w-full object-cover" /> : <Layers size={28} className="text-slate-300" />}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-semibold text-slate-900">{d.name}</p>
                  {d.isActive === false && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Hidden</span>}
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-400" />
                </div>
                {d.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{d.description}</p>}
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                  <Stat Icon={Layers}>{d.stats.services} services</Stat>
                  <Stat Icon={CircleDot}>{d.stats.liveForCustomers} live</Stat>
                  <Stat Icon={Users}>{d.stats.approved} providers</Stat>
                  {d.stats.pending > 0 && <Stat Icon={Clock}><span className="font-semibold text-amber-600">{d.stats.pending} waiting</span></Stat>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Level 2 — services in a domain */
function DomainView({ domain, onBack, onOpen, onChanged }) {
  const [, setParams] = useSearchParams();
  const [editingDomain, setEditingDomain] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  return (
    <div>
      <Header title={domain.name} subtitle={domain.description} onBack={onBack}>
        <button onClick={() => setEditingDomain(true)} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          <Pencil size={14} /> Edit domain
        </button>
        <button onClick={() => setEditingLine({ domainCode: domain.code })} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          <Plus size={15} /> Add service
        </button>
      </Header>
      {editingDomain && <DomainForm initial={domain} onClose={() => setEditingDomain(false)} onSaved={() => { setEditingDomain(false); onChanged(); }} />}
      {editingLine && <ServiceForm initial={editingLine} onClose={() => setEditingLine(null)} onSaved={() => { setEditingLine(null); onChanged(); }} />}

      {!domain.lines.length ? <EmptyState message="No services in this domain yet" icon={Wrench} /> : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          {domain.lines.map((l) => {
            const st = statusOf(l);
            return (
              <div key={l._id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50">
                  {l.imageUrl ? <img src={l.imageUrl} alt="" className="h-full w-full object-cover" /> : <Wrench size={18} className="text-slate-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{l.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.tone}`}>{st.text}</span>
                    <Stat Icon={Users}>{l.approved} approved</Stat>
                    {l.pending > 0 && (
                      <button onClick={() => setParams({ tab: 'verification', v: 'queue' })} className="text-xs font-semibold text-amber-600 hover:underline">
                        {l.pending} waiting for review
                      </button>
                    )}
                  </div>
                </div>
                <button onClick={() => setEditingLine(l)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Edit service">
                  <Pencil size={15} />
                </button>
                {l.console ? (
                  <button onClick={() => onOpen(l)} className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                    Manage <ChevronRight size={14} />
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">No booking flow yet</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Level 3 — the service's own console */
function ConsoleView({ domain, line, onBack }) {
  const c = line.console;
  return (
    <div>
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> {domain.name}
      </button>
      <Suspense fallback={<PageLoader />}>
        {c.kind === 'repair' && <RepairVertical vertical={c.vertical} label={line.name} deepCatalog={c.deepCatalog} />}
        {c.kind === 'pet' && <Pet />}
        {c.kind === 'helping' && <Helping />}
      </Suspense>
    </div>
  );
}

/* Forms — create and edit share one component each */
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500';

function useSave(resource, initial, onSaved) {
  const [create, { isLoading: creating }] = useAdminOnboardingCreateMutation();
  const [update, { isLoading: updating }] = useAdminOnboardingUpdateMutation();
  async function save(payload) {
    try {
      if (initial._id) await update({ resource, id: initial._id, ...payload }).unwrap();
      else await create({ resource, ...payload }).unwrap();
      toast.success('Saved');
      onSaved();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save');
    }
  }
  return [save, creating || updating];
}

function DomainForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState({
    name: initial.name || '', description: initial.description || '', imageUrl: initial.imageKey || '',
    displayOrder: initial.displayOrder ?? 0, isActive: initial.isActive !== false,
  });
  const [save, busy] = useSave('domains', initial, onSaved);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  return (
    <Modal title={initial._id ? `Edit ${initial.name}` : 'Add domain'} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save({ ...f, ...(initial._id ? {} : { code: slug(f.name) }) }); }}>
        <Field label="Name"><input className={inputCls} value={f.name} onChange={set('name')} required /></Field>
        <Field label="Description"><input className={inputCls} value={f.description} onChange={set('description')} /></Field>
        <Field label="Photo"><ImageUploadField value={f.imageUrl} onChange={set('imageUrl')} folder="service-domains" /></Field>
        <div className="flex gap-3">
          <Field label="Order"><input type="number" className={inputCls} value={f.displayOrder} onChange={(e) => setF((x) => ({ ...x, displayOrder: Number(e.target.value) }))} /></Field>
          <Field label="Visible">
            <button type="button" onClick={() => setF((x) => ({ ...x, isActive: !x.isActive }))} className={`rounded-lg px-3 py-2 text-xs font-bold ${f.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {f.isActive ? 'Visible' : 'Hidden'}
            </button>
          </Field>
        </div>
        <SubmitRow busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

function ServiceForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState({
    name: initial.name || '', tagline: initial.tagline || '', description: initial.description || '',
    imageUrl: initial.imageKey || '', status: initial.status || 'coming_soon', isActive: initial.isActive !== false,
    displayOrder: initial.displayOrder ?? 0, customerPath: initial.customerPath || '', repairVertical: initial.repairVertical || '',
  });
  const [advanced, setAdvanced] = useState(false);
  const [save, busy] = useSave('lines', initial, onSaved);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  function submit(e) {
    e.preventDefault();
    const payload = { ...f, repairVertical: f.repairVertical || null };
    if (!initial._id) Object.assign(payload, { code: slug(f.name), domainCode: initial.domainCode });
    save(payload);
  }
  return (
    <Modal title={initial._id ? `Edit ${initial.name}` : 'Add service'} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Name"><input className={inputCls} value={f.name} onChange={set('name')} required /></Field>
        <Field label="Tagline" hint="One line customers see under the name."><input className={inputCls} value={f.tagline} onChange={set('tagline')} /></Field>
        <Field label="Description"><input className={inputCls} value={f.description} onChange={set('description')} /></Field>
        <Field label="Photo"><ImageUploadField value={f.imageUrl} onChange={set('imageUrl')} folder="service-lines" /></Field>
        <div className="flex flex-wrap gap-3">
          <Field label="Status" hint="Customers see it only when live AND a provider is approved.">
            <select className={inputCls} value={f.status} onChange={set('status')}>
              <option value="coming_soon">Coming soon</option>
              <option value="live">Live</option>
            </select>
          </Field>
          <Field label="Visible">
            <button type="button" onClick={() => setF((x) => ({ ...x, isActive: !x.isActive }))} className={`rounded-lg px-3 py-2 text-xs font-bold ${f.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {f.isActive ? 'Visible' : 'Hidden'}
            </button>
          </Field>
        </div>
        <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-xs font-semibold text-indigo-600">
          {advanced ? 'Hide' : 'Show'} booking setup
        </button>
        {advanced && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <Field label="Customer link" hint="Where tapping this service takes a customer, e.g. /repair/laptop.">
              <input className={inputCls} value={f.customerPath} onChange={set('customerPath')} />
            </Field>
            <Field label="Repair engine vertical" hint="Only for repair services, e.g. laptop or two_wheeler.">
              <input className={inputCls} value={f.repairVertical} onChange={set('repairVertical')} />
            </Field>
            <Field label="Order"><input type="number" className={inputCls} value={f.displayOrder} onChange={(e) => setF((x) => ({ ...x, displayOrder: Number(e.target.value) }))} /></Field>
          </div>
        )}
        <SubmitRow busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

function SubmitRow({ busy, onClose }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
      <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
        {busy && <Loader2 size={14} className="animate-spin" />} Save
      </button>
    </div>
  );
}
