import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Plus, X } from 'lucide-react';
import { useLazyAdminFleetAreaQuery } from '@shared/services/api';

// Pincodes and localities a hub serves: type 500081, or Gachibowli; each is looked up and shown on the map before saving.
export default function AreaPicker({ places, near, onChange }) {
  const [text, setText] = useState('');
  const [lookup, { isFetching }] = useLazyAdminFleetAreaQuery();

  async function add() {
    const asks = text.split(/[,;\n]+/).map((t) => t.trim()).filter((t) => t.length >= 2);
    if (!asks.length) { toast.error('Type a pincode or an area name, e.g. 500081 or Gachibowli'); return; }
    const found = [];
    for (const q of asks) {
      const r = await lookup({ q, ...(near || {}) }, true).unwrap().catch((e) => { toast.error(e?.data?.error || `Could not find ${q}`); return null; });
      const a = r?.area;
      if (a && ![...places, ...found].some((p) => p.key === a.key)) found.push({ kind: a.kind, key: a.key, name: a.name, bbox: a.bbox, area: box(a.bbox) });
    }
    if (found.length) { onChange([...places, ...found]); setText(''); }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="500081, 500032, Gachibowli" aria-label="Pincodes or areas to add" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:w-80" />
        <button type="button" onClick={add} disabled={isFetching} className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {isFetching ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
        </button>
      </div>
      {places.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {places.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
              {p.kind === 'pincode' ? p.key : p.name}{p.kind === 'pincode' && p.name ? <span className="font-normal text-cyan-600">{p.name}</span> : null}
              <button type="button" onClick={() => onChange(places.filter((x) => x.key !== p.key))} aria-label={`Remove ${p.name || p.key}`}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const box = ({ west, south, east, north }) => ({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] });
