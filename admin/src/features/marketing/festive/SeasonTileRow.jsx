import { X } from 'lucide-react';
import ImageUploadField from '@shared/components/common/ImageUploadField';
import { Input, Select } from '../../../ui/kit';

/** One tile on the festive top: what it says, which live service it opens, its photo and badge. */
export default function SeasonTileRow({ tile, services, onChange, onRemove }) {
  const set = (k) => (e) => onChange({ ...tile, [k]: e?.target ? e.target.value : e });
  return (
    <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_110px_auto] sm:items-start">
      <Input value={tile.title} onChange={set('title')} placeholder="Pooja-ready home" maxLength={40} aria-label="Tile title" />
      <Select value={tile.serviceCode} onChange={set('serviceCode')} aria-label="Service">
        <option value="">Choose a service…</option>
        {services.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
      </Select>
      <Input value={tile.badge} onChange={set('badge')} placeholder="Badge" maxLength={20} aria-label="Badge" />
      <button type="button" onClick={onRemove} aria-label="Remove tile" className="justify-self-end rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
      <div className="sm:col-span-4">
        <ImageUploadField value={tile.imageUrl} onChange={set('imageUrl')} folder="seasons" label="tile photo (optional: the service's own art is used without one)" accept="image/*" maxMb={5} />
      </div>
    </div>
  );
}
