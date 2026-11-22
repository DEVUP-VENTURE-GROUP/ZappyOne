// Read-only look at a shop's or independent pro's store: each service, whether customers see it, every job and its price per option.
import { useEffect, useState } from 'react';
import { X, Store, Eye, EyeOff, Clock, ImageOff, Pencil, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAdminProviderStoreQuery, useAdminEditStoreItemMutation } from '@shared/services/api';
import { PageSkeleton, ErrorState, EmptyState, StatusBadge, fmt } from '@/ui/kit';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Hours({ hours }) {
  if (!hours?.length) return <span className="text-slate-400">Hours not set</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {[...hours].sort((a, b) => a.day - b.day).map((h) => (
        <span key={h.day} className="tabular-nums"><b className="font-semibold text-slate-700">{DAYS[h.day]}</b> {h.isClosed ? 'Closed' : `${h.opensAt || '?'}–${h.closesAt || '?'}`}</span>
      ))}
    </span>
  );
}

function Visible({ on }) {
  return on
    ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><Eye size={11} /> Customers see this</span>
    : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full"><EyeOff size={11} /> Hidden from customers</span>;
}

const MAX_INCLUDES = 8;

function ItemEditor({ item, target, onClose }) {
  const [name, setName] = useState(item.name);
  const [minutes, setMinutes] = useState(item.minutes ?? '');
  const [includes, setIncludes] = useState(item.includes?.length ? item.includes : ['']);
  const [keep, setKeep] = useState(() => (item.photoUrls || []).map(() => true));
  const [shown, setShown] = useState(item.offered);
  const [save, { isLoading }] = useAdminEditStoreItemMutation();

  async function submit(e) {
    e.preventDefault();
    const body = {};
    const lines = includes.map((x) => x.trim()).filter(Boolean);
    if (item.own && name.trim() !== item.name) body.name = name.trim();
    if (minutes !== '' && Number(minutes) !== item.minutes) body.minutes = Number(minutes);
    if (lines.join('\n') !== (item.includes || []).join('\n')) body.includes = lines;
    if (keep.some((k) => !k)) body.keepPhotos = keep.flatMap((k, i) => (k ? [i] : []));
    if (shown !== item.offered) body.hidden = !shown;
    if (!Object.keys(body).length) return onClose();
    try {
      await save({ ...target, code: item.repairCode, ...body }).unwrap();
      toast.success('Saved. The partner has been told.');
      onClose();
    } catch (err) { toast.error(err.data?.error || 'Could not save. Try again.'); }
  }

  const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zappy-400';
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Edit ${item.name}`}
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-900">Edit job</p>
            <p className="text-xs text-slate-500">Prices are set by the partner and stay as they are.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-600">Name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} minLength={2} required disabled={!item.own} />
          {!item.own && <span className="text-[11px] text-slate-400">A ZappyOne sample keeps its catalogue name.</span>}
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-600">Takes (minutes)</span>
          <input className={input} type="number" min={5} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-600 mb-1">What is included</legend>
          {includes.map((line, i) => (
            <div key={i} className="flex gap-2">
              <input className={input} value={line} maxLength={60} aria-label={`Included line ${i + 1}`}
                onChange={(e) => setIncludes(includes.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" aria-label="Remove line" onClick={() => setIncludes(includes.filter((_, j) => j !== i))}
                className="px-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><X size={14} /></button>
            </div>
          ))}
          {includes.length < MAX_INCLUDES && (
            <button type="button" onClick={() => setIncludes([...includes, ''])} className="flex items-center gap-1 text-xs font-bold text-zappy-700"><Plus size={13} /> Add a line</button>
          )}
        </fieldset>

        {item.photoUrls?.length > 0 && (
          <fieldset>
            <legend className="text-xs font-semibold text-slate-600 mb-2">Photos (tap to remove or keep)</legend>
            <div className="flex flex-wrap gap-2">
              {item.photoUrls.map((url, i) => (
                <button type="button" key={url} aria-pressed={keep[i]} onClick={() => setKeep(keep.map((k, j) => (j === i ? !k : k)))}
                  className={`relative w-16 h-16 rounded-lg overflow-hidden ring-2 ${keep[i] ? 'ring-transparent' : 'ring-red-400 opacity-40'}`}>
                  <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  {!keep[i] && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-red-700 bg-white/60">Removed</span>}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
          <span className="text-sm font-semibold text-slate-700">Customers can book this</span>
          <input type="checkbox" className="w-4 h-4 accent-zappy-600" checked={shown} onChange={(e) => setShown(e.target.checked)} />
        </label>

        <button type="submit" disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 bg-zappy-600 hover:bg-zappy-700 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-xl transition">
          {isLoading && <Loader2 size={14} className="animate-spin" />} Save
        </button>
      </form>
    </div>
  );
}

function MenuTable({ svc, target }) {
  const [editing, setEditing] = useState(null);
  const rows = [...svc.items].sort((a, b) => Number(b.offered) - Number(a.offered));
  if (!rows.length) return <p className="text-sm text-slate-500">No jobs in this menu yet.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      {editing && <ItemEditor item={editing} target={{ ...target, vertical: svc.vertical }} onClose={() => setEditing(null)} />}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="text-left font-semibold px-3 py-2">Job</th>
            <th className="text-left font-semibold px-3 py-2">Included</th>
            {svc.types.map((t) => <th key={t.code} className="text-right font-semibold px-3 py-2 whitespace-nowrap">{t.name}</th>)}
            <th className="text-left font-semibold px-3 py-2">Status</th>
            <th className="px-3 py-2"><span className="sr-only">Edit</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((i) => (
            <tr key={i.repairCode} className={i.offered ? '' : 'text-slate-400'}>
              <td className="px-3 py-2 align-top">
                <div className="flex items-center gap-2 min-w-[180px]">
                  {i.photoUrl
                    ? <img src={i.photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" />
                    : <span className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0" title="No photo"><ImageOff size={14} className="text-slate-400" /></span>}
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{i.name}</p>
                    <p className="text-[11px] text-slate-500">{i.own ? 'Their own job' : 'ZappyOne sample'}{i.minutes ? ` · ${i.minutes} min` : ''}</p>
                    {i.offer && <span className="mt-0.5 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Offer: {i.offer.label}{i.offer.endsAt ? ` till ${new Date(i.offer.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</span>}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 align-top text-xs text-slate-600 min-w-[160px]">{i.includes?.length ? i.includes.join(', ') : <span className="text-amber-600">Not said</span>}</td>
              {svc.types.map((t) => (
                <td key={t.code} className="px-3 py-2 align-top text-right tabular-nums whitespace-nowrap">
                  {i.prices?.[t.code] != null ? <span className="font-semibold text-slate-800">{fmt(i.prices[t.code])}</span> : <span className="text-slate-300">—</span>}
                </td>
              ))}
              <td className="px-3 py-2 align-top"><StatusBadge status={i.offered ? 'active' : 'offline'} /></td>
              <td className="px-3 py-2 align-top">
                <button type="button" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}
                  className="flex items-center gap-1 text-xs font-bold text-zappy-700 hover:bg-zappy-50 px-2 py-1 rounded-lg"><Pencil size={12} /> Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelTable({ svc }) {
  if (!svc.rows.length) return <p className="text-sm text-slate-500">No prices set yet.</p>;
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              {['Job', 'Brand', 'Model', 'Quality', 'Mode'].map((h) => <th key={h} className="text-left font-semibold px-3 py-2">{h}</th>)}
              <th className="text-right font-semibold px-3 py-2">Price</th>
              <th className="text-left font-semibold px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {svc.rows.map((r, idx) => (
              <tr key={`${r.job}-${r.brand}-${r.model}-${r.quality}-${idx}`}>
                <td className="px-3 py-2 font-semibold text-slate-800">{r.job}</td>
                <td className="px-3 py-2 text-slate-600">{r.brand}</td>
                <td className="px-3 py-2 text-slate-600">{r.model}</td>
                <td className="px-3 py-2 text-slate-600 capitalize">{r.quality ? r.quality.replace(/_/g, ' ') : '—'}</td>
                <td className="px-3 py-2 text-slate-600 capitalize">{r.serviceMode || 'Any'}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmt(r.totalPaise)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.approvalStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {svc.more && <p className="text-xs text-slate-500 mt-2">Showing the first 300 prices.</p>}
    </>
  );
}

function Service({ svc, target }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-slate-900">{svc.name}</h3>
        <StatusBadge status={svc.enrolment} />
        {svc.mode !== 'none' && <Visible on={svc.visible} />}
        {svc.mode !== 'none' && (
          <span className="text-xs text-slate-500">Inspection fee: <b className="text-slate-700">{svc.inspectionFeePaise ? fmt(svc.inspectionFeePaise) : 'Free'}</b></span>
        )}
      </div>
      {svc.tips?.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Still to do: {svc.tips.join(' · ')}</p>
      )}
      {svc.mode === 'menu' && <MenuTable svc={svc} target={target} />}
      {svc.mode === 'models' && <ModelTable svc={svc} />}
      {svc.mode === 'none' && <p className="text-sm text-slate-500">This service has no price list of its own.</p>}
    </section>
  );
}

export default function StoreSetup({ kind, id, onClose }) {
  const { data, isLoading, isError, refetch, isFetching } = useAdminProviderStoreQuery({ kind, id });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const p = data?.provider;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Store setup" className="bg-white w-full max-w-5xl h-full flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-zappy-50 flex items-center justify-center shrink-0"><Store size={18} className="text-zappy-700" /></span>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">{p?.name || 'Store'}</p>
              {p && (
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                  <StatusBadge status={p.kycStatus} />
                  {p.isBlocked && <StatusBadge status="blocked" />}
                  {!p.isBlocked && <span className={p.openForBookings ? 'text-emerald-700 font-semibold' : 'text-slate-500 font-semibold'}>{p.openForBookings ? 'Open for bookings' : 'Closed for bookings'}</span>}
                  {kind === 'shop' && p.takingOrders === false && <span className="text-amber-700 font-semibold">Paused new orders</span>}
                  {kind === 'worker' && <span>{p.isOnline ? 'Online now' : 'Offline'}</span>}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100 transition"><X size={16} /></button>
        </header>

        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {isLoading && <PageSkeleton rows={6} />}
          {isError && <ErrorState onRetry={refetch} />}
          {data && (
            <>
              {kind === 'shop' && (
                <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 rounded-xl px-4 py-3">
                  <Clock size={14} className="text-slate-400 shrink-0 mt-0.5" /><Hours hours={p.hours} />
                </div>
              )}
              {data.services.length === 0
                ? <EmptyState icon={Store} message="They have not signed up for any service yet." />
                : data.services.map((svc) => <Service key={svc.lineCode} svc={svc} target={{ kind, id }} />)}
              {isFetching && !isLoading && <p className="text-xs text-slate-400">Refreshing…</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
