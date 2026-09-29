import { useState, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Inbox, ShieldCheck, Plus, Loader2, Check, X, Store, User,
  Archive, Pencil, MessageSquarePlus, Camera, Upload, MapPin, FileWarning,
} from 'lucide-react';
import {
  useAdminOnboardingListQuery,
  useAdminOnboardingCreateMutation,
  useAdminOnboardingUpdateMutation,
  useAdminOnboardingArchiveMutation,
  useAdminOnboardingEnrolmentsQuery,
  useAdminDecideEnrolmentMutation,
  useAdminOnboardingLineRequestsQuery,
  useAdminApproveLineRequestMutation,
  useAdminRejectLineRequestMutation,
  usePresignUploadMutation,
} from '@shared/services/api';
import {
  SectionHeader, Card, Th, Td, EmptyState, PageLoader, StatusBadge, fmtDate,
} from '../../ui/kit';
import toast from 'react-hot-toast';

/**
 * Provider onboarding console.
 *
 * Everything a provider is offered — the domains, the services under them, and
 * the documents each one demands — is edited here. Opening a new service to
 * providers is a row an operator adds, not a release.
 *
 * The verification queue is the other half: applications arrive here scoped to
 * ONE service, and a decision applies only to that service. Approving a shop
 * for phones says nothing about laptops, and suspending their laptop work
 * leaves the phone work they are doing well alone.
 */

/**
 * Every approval in the platform, in one place:
 *   queue    — a shop or independent worker applying for a service (approves identity too)
 *   workers  — identity-only checks: shop technicians, who never apply for a service
 *   shops    — shops that submitted the standalone shop verification
 */
const TABS = [
  { id: 'queue', label: 'Service applications', icon: Inbox },
  { id: 'workers', label: 'Worker identity', icon: User },
  { id: 'shops', label: 'Shop identity', icon: Store },
  { id: 'requests', label: 'Service requests', icon: MessageSquarePlus },
  { id: 'requirements', label: 'Requirements', icon: ShieldCheck },
];

const WorkerIdentity = lazy(() => import('./KycReview'));
const ShopIdentity = lazy(() => import('./Shops'));

/* Verification queue */

function ProviderCell({ row }) {
  const p = row.provider;
  const isShop = !!row.shopId;
  if (!p) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        {isShop ? <Store size={13} className="text-slate-500" /> : <User size={13} className="text-slate-500" />}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 text-sm truncate">{p.businessName || p.name}</p>
        <p className="text-[11px] text-slate-400">{p.phone}{isShop ? ' · shop' : ' · individual'}</p>
      </div>
    </div>
  );
}

function Queue() {
  const [status, setStatus] = useState('pending_review');
  const { data, isLoading, refetch } = useAdminOnboardingEnrolmentsQuery({ status });
  const [decide, { isLoading: deciding }] = useAdminDecideEnrolmentMutation();
  const [notes, setNotes] = useState({});
  const [open, setOpen] = useState(null);

  if (isLoading) return <PageLoader />;
  const items = data?.items || [];

  async function act(row, decision) {
    const note = notes[row._id] || '';
    // A rejection with no reason produces a support ticket, not a fix.
    if (decision === 'rejected' && !note.trim()) {
      return toast.error('Tell them what to fix before rejecting');
    }
    try {
      await decide({ id: row._id, decision, note }).unwrap();
      toast.success(decision === 'approved' ? 'Approved — provider notified' : 'Decision sent');
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Failed');
    }
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Verification queue"
        subtitle="Each application covers ONE service. A decision here applies to that service only."
      >
        <select
          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="pending_review">Awaiting review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
          <option value="draft">Not submitted</option>
          <option value="all">All</option>
        </select>
      </SectionHeader>

      {!items.length && <EmptyState message="Nothing waiting" icon={Inbox} />}

      {items.map((row) => (
        <Card key={row._id} className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <ProviderCell row={row} />
              <div className="flex items-center gap-2 mt-2">
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">
                  {row.line?.name || row.lineCode}
                </span>
                <StatusBadge status={row.status} />
                {row.submittedAt && <span className="text-[11px] text-slate-400">{fmtDate(row.submittedAt)}</span>}
              </div>

              <button
                onClick={() => setOpen(open === row._id ? null : row._id)}
                className="text-xs font-bold text-blue-600 mt-2"
              >
                {open === row._id ? 'Hide' : 'View'} {row.documents?.length || 0} document(s)
              </button>

              {open === row._id && (
                <div>
                  {/*
                    * The documents, as documents.
                    *
                    * This listed the raw S3 key as a link — a path with no host
                    * that went nowhere when clicked. A reviewer was being asked
                    * to approve somebody's identity papers without ever seeing
                    * them, which is not review, it is rubber-stamping. Each one
                    * is now shown as the image it is, opening full size.
                    */}
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {(row.documents || []).map((d) => (
                      <DocumentCard key={d.code} doc={d} />
                    ))}
                  </div>

                  <div className="mt-2 space-y-1.5">
                  {(row.fields || []).map((f) => (
                    <div key={f.code} className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600 w-40 truncate">{f.code}</span>
                      <span className="text-xs text-slate-800">{f.value}</span>
                    </div>
                  ))}
                    <p className="text-[11px] text-slate-400">
                      Declarations {row.acceptedDeclarations ? 'accepted' : 'NOT accepted'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-end gap-2 flex-wrap">
              <input
                placeholder="note to the provider"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-60 outline-none focus:ring-2 focus:ring-blue-500"
                value={notes[row._id] || ''}
                onChange={(e) => setNotes((n) => ({ ...n, [row._id]: e.target.value }))}
              />
              <button onClick={() => act(row, 'approved')} disabled={deciding}
                className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold disabled:opacity-60">
                {deciding ? <Loader2 size={13} className="animate-spin" /> : 'Approve'}
              </button>
              <button onClick={() => act(row, 'rejected')} disabled={deciding}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold">
                Reject
              </button>
              {row.status === 'approved' && (
                <button onClick={() => act(row, 'suspended')} disabled={deciding}
                  className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold">
                  Suspend
                </button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* Provider-proposed services */

function Requests() {
  const { data, isLoading, refetch } = useAdminOnboardingLineRequestsQuery({ status: 'pending' });
  const { data: domainData } = useAdminOnboardingListQuery({ resource: 'domains' });
  const [approve] = useAdminApproveLineRequestMutation();
  const [reject] = useAdminRejectLineRequestMutation();
  const [form, setForm] = useState({});

  if (isLoading) return <PageLoader />;
  const items = data?.items || [];
  const domains = domainData?.items || [];

  async function doApprove(row) {
    const f = form[row._id] || {};
    if (!f.code || !(f.domainCode || row.domainCode)) {
      return toast.error('A code and a domain are required to create the service');
    }
    try {
      await approve({
        id: row._id,
        code: f.code,
        name: f.name || row.proposedName,
        domainCode: f.domainCode || row.domainCode,
        status: f.status || 'coming_soon',
      }).unwrap();
      toast.success('Service created');
      refetch();
    } catch (err) { toast.error(err?.data?.error || 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Service requests"
        subtitle="Work providers asked for that we do not carry. Approving one creates the real service."
      />
      {!items.length && <EmptyState message="No pending requests" icon={MessageSquarePlus} />}

      {items.map((row) => (
        <Card key={row._id} className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="font-bold text-slate-900">{row.proposedName}</p>
              {row.description && <p className="text-xs text-slate-500 mt-0.5">{row.description}</p>}
              <p className="text-[11px] text-slate-400 mt-1">
                {row.domainCode || 'no domain'} · {row.providerKind} · {fmtDate(row.createdAt)}
              </p>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <select
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={form[row._id]?.domainCode || row.domainCode || ''}
                onChange={(e) => setForm((f) => ({ ...f, [row._id]: { ...f[row._id], domainCode: e.target.value } }))}
              >
                <option value="">domain…</option>
                {domains.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select>
              <input
                placeholder="new code"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-40 outline-none focus:ring-2 focus:ring-blue-500"
                value={form[row._id]?.code || ''}
                onChange={(e) => setForm((f) => ({ ...f, [row._id]: { ...f[row._id], code: e.target.value } }))}
              />
              <button onClick={() => doApprove(row)}
                className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold">
                Create service
              </button>
              <button onClick={async () => { await reject({ id: row._id, note: '' }).unwrap(); refetch(); }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold">
                Reject
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* Generic catalog table */

// Domains and services are edited in Services (pages/services/ServicesHub).
const SPECS = {
  requirements: {
    title: 'Verification requirements',
    hint: 'What a provider must show for a service. Leave the service blank to cover the whole domain; a set naming a service overrides it.',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'domainCode', label: 'Domain' },
      { key: 'lineCode', label: 'Service' },
      { key: 'providerKind', label: 'Kind', type: 'select', options: ['shop', 'individual'] },
      { key: 'minSkillLevel', label: 'Min skill', type: 'number' },
      { key: 'isActive', label: 'Active', type: 'boolean' },
    ],
  },
};

function Field({ field, value, onChange }) {
  const base = 'w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500';
  if (field.type === 'boolean') {
    return (
      <button type="button" onClick={() => onChange(!value)}
        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${value ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
        {value ? 'Yes' : 'No'}
      </button>
    );
  }
  if (field.type === 'select') {
    return (
      <select className={base} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === 'number') {
    return (
      <input type="number" className={base} value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    );
  }
  return <input className={base} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

function CatalogTable({ resource }) {
  const spec = SPECS[resource];
  const { data, isFetching, refetch } = useAdminOnboardingListQuery({ resource });
  const [create, { isLoading: creating }] = useAdminOnboardingCreateMutation();
  const [update, { isLoading: updating }] = useAdminOnboardingUpdateMutation();
  const [archive] = useAdminOnboardingArchiveMutation();

  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});

  const items = data?.items || [];

  function startNew() {
    const blank = {};
    for (const f of spec.fields) blank[f.key] = f.type === 'boolean' ? true : '';
    setDraft(blank);
    setEditing('new');
  }

  function startEdit(row) {
    const d = {};
    for (const f of spec.fields) d[f.key] = row[f.key];
    setDraft(d);
    setEditing(row._id);
  }

  async function save() {
    try {
      const payload = Object.fromEntries(
        Object.entries(draft).filter(([, v]) => v !== '' && v !== null && v !== undefined),
      );
      if (editing === 'new') await create({ resource, ...payload }).unwrap();
      else await update({ resource, id: editing, ...payload }).unwrap();
      toast.success('Saved');
      setEditing(null);
      refetch();
    } catch (err) {
      toast.error(err?.data?.error || 'Save failed');
    }
  }

  async function doArchive(row) {
    if (!window.confirm(
      `Archive "${row.name || row.code}"?\n\nProviders already approved against it keep their approval — it simply stops being offered.`,
    )) return;
    try {
      await archive({ resource, id: row._id }).unwrap();
      toast.success('Archived');
      refetch();
    } catch (err) { toast.error(err?.data?.error || 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <SectionHeader title={spec.title} subtitle={spec.hint}>
        <button onClick={startNew}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition">
          <Plus size={14} /> Add
        </button>
      </SectionHeader>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-0.5 bg-blue-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {spec.fields.map((f) => <Th key={f.key}>{f.label}</Th>)}
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {editing === 'new' && (
                <tr className="bg-blue-50/40">
                  {spec.fields.map((f) => (
                    <Td key={f.key}>
                      <Field field={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
                    </Td>
                  ))}
                  <Td right>
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={save} disabled={creating} className="p-1.5 rounded-lg bg-green-100 text-green-700">
                        {creating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500">
                        <X size={13} />
                      </button>
                    </div>
                  </Td>
                </tr>
              )}

              {items.map((row) => {
                const isEditing = editing === row._id;
                return (
                  <tr key={row._id} className={`hover:bg-slate-50/60 ${row.isArchived ? 'opacity-50' : ''}`}>
                    {spec.fields.map((f) => (
                      <Td key={f.key}>
                        {isEditing
                          ? <Field field={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
                          : renderValue(row, f)}
                      </Td>
                    ))}
                    <Td right>
                      <div className="flex items-center gap-1.5 justify-end">
                        {isEditing ? (
                          <>
                            <button onClick={save} disabled={updating} className="p-1.5 rounded-lg bg-green-100 text-green-700">
                              {updating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg bg-slate-100 text-slate-500">
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(row)} className="p-1.5 rounded-lg bg-slate-100 text-slate-600" title="Edit">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => doArchive(row)} className="p-1.5 rounded-lg bg-amber-50 text-amber-700" title="Archive">
                              <Archive size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!items.length && !isFetching && editing !== 'new' && <EmptyState message={`No ${spec.title.toLowerCase()} yet`} />}
        </div>
      </Card>

      {resource === 'requirements' && <RequirementEditor items={items} onSaved={refetch} />}
    </div>
  );
}

function renderValue(row, field) {
  const v = row[field.key];
  if (v == null || v === '') return <span className="text-slate-300">—</span>;
  if (field.type === 'boolean') return v ? <Check size={13} className="text-green-600" /> : <span className="text-slate-300">—</span>;
  return String(v);
}

/**
 * Documents, fields and declarations are lists, so they get their own editor
 * rather than being crammed into a table cell — this is the part operators
 * actually change when a service's bar moves.
 */
function RequirementEditor({ items, onSaved }) {
  const [selected, setSelected] = useState('');
  const [update, { isLoading }] = useAdminOnboardingUpdateMutation();
  const [draft, setDraft] = useState(null);

  const set = items.find((i) => i._id === selected);

  function load(id) {
    setSelected(id);
    const row = items.find((i) => i._id === id);
    setDraft(row ? {
      documents: JSON.stringify(row.documents || [], null, 2),
      fields: JSON.stringify(row.fields || [], null, 2),
      declarations: (row.declarations || []).join('\n'),
    } : null);
  }

  async function save() {
    try {
      await update({
        resource: 'requirements',
        id: selected,
        documents: JSON.parse(draft.documents),
        fields: JSON.parse(draft.fields),
        declarations: draft.declarations.split('\n').map((s) => s.trim()).filter(Boolean),
      }).unwrap();
      toast.success('Requirements updated');
      onSaved();
    } catch (err) {
      toast.error(err?.message?.includes('JSON') ? 'Check the JSON format' : (err?.data?.error || 'Save failed'));
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h4 className="text-sm font-bold text-slate-900">Documents, details and declarations</h4>
        <p className="text-xs text-slate-500 mt-0.5">
          What the provider is actually asked for. Changes apply to the next submission — decisions already
          made stay judged against the rules that were in force.
        </p>
      </div>

      <select
        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-full max-w-md outline-none focus:ring-2 focus:ring-blue-500"
        value={selected}
        onChange={(e) => load(e.target.value)}
      >
        <option value="">Choose a requirement set…</option>
        {items.map((i) => (
          <option key={i._id} value={i._id}>
            {i.name} — {i.domainCode}{i.lineCode ? ` / ${i.lineCode}` : ''} ({i.providerKind})
          </option>
        ))}
      </select>

      {set && draft && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <p className="text-xs font-bold text-slate-600 mb-1">Documents</p>
            <textarea rows={12}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
              value={draft.documents}
              onChange={(e) => setDraft((d) => ({ ...d, documents: e.target.value }))} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600 mb-1">Details asked</p>
            <textarea rows={12}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
              value={draft.fields}
              onChange={(e) => setDraft((d) => ({ ...d, fields: e.target.value }))} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600 mb-1">Declarations — one per line</p>
            <textarea rows={12}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
              value={draft.declarations}
              onChange={(e) => setDraft((d) => ({ ...d, declarations: e.target.value }))} />
          </div>
        </div>
      )}

      {set && (
        <button onClick={save} disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          {isLoading ? 'Saving…' : 'Save requirements'}
        </button>
      )}
    </Card>
  );
}

/* Shell */

/**
 * One submitted document, shown rather than linked.
 *
 * `viewUrl` is a short-lived presigned URL from the server; the stored `url` is
 * a private S3 key that a browser cannot load. If presigning failed the card
 * says so plainly instead of rendering a broken image — a reviewer needs to
 * know the difference between "this document is wrong" and "I cannot see it".
 */
function DocumentCard({ doc }) {
  const live = doc.captureMethod === 'live_camera';
  const [broken, setBroken] = useState(false);
  const viewable = doc.viewUrl && !broken;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="relative aspect-[4/3] bg-slate-50">
        {viewable ? (
          <a href={doc.viewUrl} target="_blank" rel="noreferrer" title="Open full size">
            <img
              src={doc.viewUrl}
              alt={doc.code}
              loading="lazy"
              onError={() => setBroken(true)}
              className="h-full w-full object-cover transition hover:opacity-90"
            />
          </a>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
            <FileWarning size={18} className="text-slate-300" />
            <span className="text-[10.5px] font-semibold text-slate-400">
              {doc.viewUrl ? 'Could not load this file' : 'No preview available'}
            </span>
          </div>
        )}

        <span
          className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${
            live ? 'bg-green-50 text-green-700' : 'bg-white text-slate-500'
          }`}
          title={live
            ? 'Taken with the camera at submission time'
            : 'Supplied as a file — could be from anywhere'}
        >
          {live ? <Camera size={10} /> : <Upload size={10} />}
          {live ? 'Live capture' : 'Uploaded'}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="truncate text-[11.5px] font-bold text-slate-700">
          {doc.code.replace(/_/g, ' ')}
        </span>
        {live && doc.lat != null && doc.lng != null && (
          <a
            href={`https://www.google.com/maps?q=${doc.lat},${doc.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-bold text-blue-600"
            title="Where this photo was taken"
          >
            <MapPin size={10} /> map
          </a>
        )}
      </div>
    </div>
  );
}

export default function ProviderOnboarding() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('v')) ? params.get('v') : 'queue';
  const setTab = (v) => setParams({ tab: params.get('tab') || 'verification', v });

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Verification"
        subtitle="Every provider check — service applications, identity, and what each service requires."
      />

      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'queue' && <Queue />}
      <Suspense fallback={<PageLoader />}>
        {tab === 'workers' && <WorkerIdentity />}
        {tab === 'shops' && <ShopIdentity reviewMode />}
      </Suspense>
      {tab === 'requests' && <Requests />}
      {tab === 'requirements' && <CatalogTable resource="requirements" />}
    </div>
  );
}
