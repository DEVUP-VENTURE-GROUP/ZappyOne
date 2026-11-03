import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock3, Eye, ImageIcon, Loader2, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  useProviderMenuQuery, useSaveProviderMenuItemMutation, useRemoveProviderMenuItemMutation,
  useAdjustProviderMenuMutation, useStartMenuFromSamplesMutation,
} from '../../../services/api';
import PhotoTiles from '../../../components/common/PhotoTiles';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;
const toRupees = (p) => (p == null ? '' : String(Math.round(p / 100)));
const COMMON_INCLUDES = ['Tools and materials', 'Clean-up after the work', 'Before and after photos'];

// The provider's own menu for one fixed-price service, live as they save: keep or drop ZappyOne's sample jobs, add their own, and set a price per option.
export default function MenuEditor({ vertical, onNext, nextLabel = 'Continue' }) {
  const { data, isLoading } = useProviderMenuQuery(vertical);
  const [startSamples, { isLoading: starting }] = useStartMenuFromSamplesMutation();
  const [adjust, { isLoading: adjusting }] = useAdjustProviderMenuMutation();
  const [editing, setEditing] = useState(null);
  const [pct, setPct] = useState('');
  const [preview, setPreview] = useState(false);

  if (isLoading || !data) return <div className="space-y-2" aria-hidden="true">{[0, 1, 2].map((k) => <div key={k} className="h-20 animate-pulse rounded-card bg-sunken" />)}</div>;
  const offered = data.items.filter((i) => i.offered);
  const more = data.items.filter((i) => !i.offered && !i.own);
  const allIncludes = [...new Set([...data.items.flatMap((i) => i.includes), ...COMMON_INCLUDES])];

  async function useSamples() {
    try { await startSamples({ vertical }).unwrap(); toast.success('Sample jobs added at suggested prices. Change any price, or remove a job.'); } catch (e) { toast.error(e?.data?.error || 'Could not add the samples'); }
  }
  async function applyPct() {
    try { await adjust({ vertical, pct: Number(pct) }).unwrap(); toast.success(`All prices changed by ${pct}%`); setPct(''); } catch (e) { toast.error(e?.data?.error || 'Could not change the prices'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[20px] font-extrabold text-ink-900">Your menu</h2>
          <p className="mt-0.5 text-[13.5px] text-ink-500">Customers near you book from this. Every change is live as soon as you save.</p>
        </div>
        {offered.length > 0 && (
          <button type="button" onClick={() => setPreview((p) => !p)} aria-pressed={preview} className="flex items-center gap-1.5 text-[13px] font-bold text-zappy-700 hover:underline">
            <Eye size={14} /> {preview ? 'Back to editing' : 'Preview as a customer'}
          </button>
        )}
      </div>

      {data.tips.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {data.tips.map((t) => <li key={t} className="rounded-full bg-amber-50 px-3 py-1 text-[12px] font-semibold text-amber-800">{t}</li>)}
        </ul>
      )}

      {!offered.length && more.length > 0 && (
        <div className="rounded-card border border-zappy-200 bg-zappy-50 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-white text-zappy-700"><Sparkles size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink-900">Start with {more.length} ready jobs</p>
              <p className="mt-0.5 text-[13px] text-ink-700">Added at suggested starting prices. Then change any price or remove what you do not do. Takes a minute.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={useSamples} disabled={starting} className="btn-primary h-10 px-4 text-[13.5px]">
              {starting && <Loader2 size={15} className="animate-spin" />} Use these jobs
            </button>
            <button type="button" onClick={() => setEditing({})} className="btn-secondary h-10 px-4 text-[13.5px]"><Plus size={15} /> Add my own job</button>
          </div>
        </div>
      )}

      {preview && <CustomerPreview items={offered} types={data.types} />}

      {!preview && offered.length > 0 && (
        <ul className="space-y-2">
          {offered.map((item) => (
            <motion.li layout key={item.repairCode} className="card flex items-start gap-3 p-3">
              {/* The photo opens the job's editor, where it is added or changed. */}
              <button type="button" onClick={() => setEditing(item)} aria-label={item.photoUrl ? `Change the photo of ${item.name}` : `Add a photo to ${item.name}`} className="h-16 w-16 shrink-0 overflow-hidden rounded-btn bg-sunken ring-zappy-300 hover:ring-2">
                {item.photoUrl ? <img src={item.photoUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-ink-400"><ImageIcon size={18} /><span className="text-[10px] font-semibold">Add photo</span></span>}
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink-900">{item.name}{item.own && <span className="ml-1.5 rounded-full bg-sunken px-2 py-0.5 align-middle text-[10.5px] font-bold text-ink-500">Your job</span>}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-500">
                  {item.minutes && <span className="flex items-center gap-1"><Clock3 size={12} /> {item.minutes} min</span>}
                  <span className="font-semibold text-ink-700">
                    {data.types.filter((t) => item.prices[t.code] != null).map((t) => `${data.types.length > 1 ? `${t.name} ` : ''}${rupees(item.prices[t.code])}`).join(' · ')}
                  </span>
                </p>
                {item.includes.length > 0 && <p className="mt-1 truncate text-[12px] text-ink-500">Includes {item.includes.join(', ')}</p>}
              </div>
              <button type="button" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-btn text-ink-500 hover:bg-sunken"><Pencil size={16} /></button>
            </motion.li>
          ))}
        </ul>
      )}

      {!preview && offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setEditing({})} className="btn-secondary h-10 px-4 text-[13.5px]"><Plus size={15} /> Add a job</button>
          <span className="flex items-center gap-1.5 rounded-btn border border-line bg-white px-2 py-1">
            <span className="text-[12.5px] font-semibold text-ink-500">All prices</span>
            <input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d-]/g, '').slice(0, 4))} placeholder="+10" aria-label="Change all prices by percent" inputMode="numeric" className="w-12 bg-transparent text-center text-[13px] font-bold outline-none" />
            <span className="text-[12.5px] font-semibold text-ink-500">%</span>
            <button type="button" onClick={applyPct} disabled={!pct || adjusting || Number(pct) === 0} className="rounded-md bg-ink-900 px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-40">Apply</button>
          </span>
        </div>
      )}

      {!preview && offered.length > 0 && more.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-400">More jobs you can add</p>
          <div className="flex flex-wrap gap-2">
            {more.map((item) => (
              <button key={item.repairCode} type="button" onClick={() => setEditing({ ...item, prices: item.suggested })} className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-700 hover:border-zappy-400">
                <Plus size={13} /> {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {onNext && <button type="button" onClick={onNext} disabled={!offered.length} className="btn-primary h-12 w-full">{nextLabel}</button>}

      <AnimatePresence>
        {editing && <ItemSheet key={editing.repairCode || 'new'} vertical={vertical} types={data.types} item={editing} suggestions={allIncludes} onClose={() => setEditing(null)} />}
      </AnimatePresence>
    </div>
  );
}

// The menu the way a customer sees it on the storefront: photo, what is included, time and the lowest price.
function CustomerPreview({ items, types }) {
  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-white px-4">
      {items.map((item) => {
        const shown = types.filter((t) => item.prices[t.code] != null).map((t) => item.prices[t.code]);
        return (
          <li key={item.repairCode} className="flex gap-3 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-bold text-ink-900">{item.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-ink-500">
                <span className="font-semibold tabular-nums text-ink-900">{shown.length > 1 ? 'from ' : ''}{rupees(Math.min(...shown))}</span>
                {item.minutes && <span className="flex items-center gap-1"><Clock3 size={13} /> about {item.minutes} min</span>}
              </p>
              {item.includes.length > 0 && <p className="mt-1.5 text-[12.5px] text-ink-500">Includes {item.includes.join(' · ')}</p>}
            </div>
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-btn bg-sunken">
              {item.photoUrl && <img src={item.photoUrl} alt="" className="h-full w-full object-cover" />}
              <span className="absolute inset-x-2 bottom-2 rounded-md bg-white py-1 text-center text-[12.5px] font-bold text-zappy-700 shadow">Book</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// One job: name (for their own), photo, what is included, time and a price per option; filling the first price fills the rest in proportion.
function ItemSheet({ vertical, types, item, suggestions, onClose }) {
  const isNew = !item.repairCode;
  const [name, setName] = useState(item.name || '');
  const [photos, setPhotos] = useState(item.photoKey ? [item.photoKey] : []);
  const [includes, setIncludes] = useState(item.includes || []);
  const [draft, setDraft] = useState('');
  const [minutes, setMinutes] = useState(item.minutes ? String(item.minutes) : '');
  const [prices, setPrices] = useState(() => Object.fromEntries(types.map((t) => [t.code, toRupees(item.prices?.[t.code])])));
  const [save, { isLoading: saving }] = useSaveProviderMenuItemMutation();
  const [remove, { isLoading: removing }] = useRemoveProviderMenuItemMutation();
  const ratio = useMemo(() => {
    const base = item.suggested?.[types[0]?.code];
    return Object.fromEntries(types.map((t) => [t.code, base && item.suggested?.[t.code] ? item.suggested[t.code] / base : 1]));
  }, [item, types]);
  const priced = Object.values(prices).filter((v) => Number(v) >= 1).length;

  function addInclude(text) {
    const t = String(text).trim();
    if (t.length < 2 || includes.includes(t) || includes.length >= 8) return;
    setIncludes((l) => [...l, t]);
    setDraft('');
  }
  function fillFrom(code) {
    const first = Number(prices[code]);
    if (!(first >= 1) || code !== types[0]?.code) return;
    setPrices((p) => Object.fromEntries(types.map((t) => [t.code, p[t.code] || String(Math.round(first * ratio[t.code]))])));
  }
  async function submit() {
    try {
      await save({
        vertical, repairCode: item.repairCode || null, name: name.trim(), includes, photoKey: photos[0] || '',
        minutes: Number(minutes) || null,
        prices: Object.fromEntries(types.map((t) => [t.code, Number(prices[t.code]) >= 1 ? Math.round(Number(prices[t.code]) * 100) : null])),
      }).unwrap();
      toast.success(isNew ? 'Added to your menu' : 'Saved. Live now.');
      onClose();
    } catch (e) { toast.error(e?.data?.error || 'Could not save'); }
  }
  async function drop() {
    try { await remove({ vertical, repairCode: item.repairCode }).unwrap(); toast.success('Removed from your menu'); onClose(); } catch (e) { toast.error(e?.data?.error || 'Could not remove'); }
  }

  return (
    <motion.div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/50 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-modal="true" aria-label={isNew ? 'Add a job' : `Edit ${item.name}`}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-sheet bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-sheet"
        initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[18px] font-extrabold text-ink-900">{isNew ? 'Add a job' : item.name}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-sunken"><X size={18} /></button>
        </div>

        <div className="mt-4 space-y-5">
          {(isNew || item.own) && (
            <label className="block text-[13px] font-semibold text-ink-700">Job name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Fridge inside clean" className="input mt-1.5 w-full text-[15px]" />
            </label>
          )}

          <div>
            <p className="text-[13px] font-semibold text-ink-700">Photo of your work</p>
            <p className="mb-2 text-[12px] text-ink-500">A real photo helps customers choose you.</p>
            <PhotoTiles value={photos} onChange={setPhotos} previews={item.photoKey && item.photoUrl ? { [item.photoKey]: item.photoUrl } : {}} max={1} folder="menu" />
          </div>

          <div>
            <p className="text-[13px] font-semibold text-ink-700">What's included</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {includes.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-zappy-50 px-2.5 py-1 text-[12.5px] font-semibold text-zappy-800">
                  {t}<button type="button" onClick={() => setIncludes((l) => l.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X size={12} /></button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInclude(draft); } }} maxLength={60} placeholder="e.g. Mopping all rooms" className="input min-w-0 flex-1 text-[14px]" />
              <button type="button" onClick={() => addInclude(draft)} className="btn-secondary px-3 text-[13px]">Add</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.filter((s) => !includes.includes(s)).slice(0, 8).map((s) => (
                <button key={s} type="button" onClick={() => addInclude(s)} className="rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-500 hover:border-zappy-400 hover:text-zappy-700">+ {s}</button>
              ))}
            </div>
          </div>

          <label className="block text-[13px] font-semibold text-ink-700">Time it takes (minutes)
            <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="e.g. 60" className="input mt-1.5 w-32 text-[15px]" />
          </label>

          <div>
            <p className="text-[13px] font-semibold text-ink-700">Your price{types.length > 1 ? ' for each size' : ''}</p>
            {types.length > 1 && <p className="text-[12px] text-ink-500">Type the first price and the rest fill in. Change any of them. Leave one empty if you do not do that size.</p>}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {types.map((t) => (
                <label key={t.code} className="block">
                  {types.length > 1 && <span className="text-[12px] font-semibold text-ink-500">{t.name}</span>}
                  <span className="mt-1 flex h-11 items-center rounded-btn border border-line-strong bg-white px-2.5 focus-within:border-zappy-600 focus-within:ring-2 focus-within:ring-zappy-100">
                    <span className="text-[14px] font-semibold text-ink-400">₹</span>
                    <input value={prices[t.code]} onChange={(e) => setPrices((p) => ({ ...p, [t.code]: e.target.value.replace(/\D/g, '').slice(0, 6) }))} onBlur={() => fillFrom(t.code)}
                      inputMode="numeric" aria-label={`Price for ${t.name}`} className="min-w-0 flex-1 bg-transparent pl-1 text-[15px] font-bold tabular-nums text-ink-900 outline-none" />
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          {!isNew && item.offered && (
            <button type="button" onClick={drop} disabled={removing} className="btn-secondary h-12 px-4 text-red-700"><Trash2 size={16} /> Remove</button>
          )}
          <button type="button" onClick={submit} disabled={saving || !priced || ((isNew || item.own) && name.trim().length < 2)} className="btn-primary h-12 flex-1">
            {saving && <Loader2 size={16} className="animate-spin" />} {isNew ? 'Add to my menu' : 'Save'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
