import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, X, PawPrint, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useMyPetsQuery, useCreateMyPetMutation, useDeleteMyPetMutation, usePetBreedsQuery,
} from '@shared/services/api';
import ImageUploadField from '@shared/components/common/ImageUploadField';

/**
 * Pet profiles (§4). Launch is dog and cat only (§1).
 *
 * Size is a dropdown the customer sets, never inferred silently from breed
 * (§7) — the breed picker only pre-fills a sensible default in the add form;
 * nothing stops a customer overriding it for their specific animal.
 */
const SPECIES = [{ value: 'dog', label: 'Dog' }, { value: 'cat', label: 'Cat' }];
const SIZES = [
  { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' }, { value: 'extra_large', label: 'Extra Large' },
];

export default function MyPetsPage() {
  const nav = useNavigate();
  const { data, isLoading } = useMyPetsQuery();
  const [deletePet] = useDeleteMyPetMutation();
  const [showAdd, setShowAdd] = useState(false);
  const pets = data?.pets || [];

  async function remove(id) {
    try {
      await deletePet(id).unwrap();
      toast.success('Removed');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not remove');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">My Pets</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-2.5 pb-24">
        {isLoading && <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>}
        {!isLoading && !pets.length && (
          <div className="text-center py-12 text-slate-400">
            <PawPrint size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm">No pets added yet.</p>
          </div>
        )}

        {pets.map((p) => (
          <button
            key={p._id}
            type="button"
            onClick={() => nav(`/pet/my-pets/${p._id}`)}
            className="w-full flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left"
          >
            <span className="shrink-0 w-12 h-12 rounded-2xl bg-zappy-50 overflow-hidden grid place-items-center">
              {p.photoKey
                ? <img src={p.photoKey} alt="" className="w-full h-full object-cover" />
                : <PawPrint size={20} className="text-zappy-400" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-black text-[#0F172A]">{p.name}</span>
              <span className="block text-xs text-slate-500 capitalize">
                {p.species}{p.breed ? ` · ${p.breed}` : ''} · {p.size.replace('_', ' ')}
              </span>
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); remove(p._id); }}
              className="p-1.5 text-slate-300 hover:text-red-500"
            >
              <Trash2 size={16} />
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="w-full rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 font-bold py-4 flex items-center justify-center gap-2"
        >
          <Plus size={16} /> Add a pet
        </button>
      </div>

      {showAdd && <AddPetSheet onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddPetSheet({ onClose }) {
  const [species, setSpecies] = useState('dog');
  const [form, setForm] = useState({
    name: '', breedCode: '', size: 'medium', weight: '', gender: 'unknown',
    allergies: '', specialNeeds: '', temperament: 'unknown',
  });
  const [photoKey, setPhotoKey] = useState('');
  const { data: breedsData } = usePetBreedsQuery({ species });
  const [create, { isLoading }] = useCreateMyPetMutation();

  const breeds = breedsData?.breeds || [];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function pickBreed(code) {
    const breed = breeds.find((b) => b.code === code);
    set('breedCode', code);
    if (breed) {
      set('breed', breed.name);
      set('size', breed.typicalSize);
    }
  }

  async function save() {
    if (!form.name.trim()) { toast.error('Give your pet a name'); return; }
    try {
      await create({
        ...form,
        species,
        photoKey,
        weight: form.weight ? Number(form.weight) : null,
        allergies: form.allergies ? form.allergies.split(',').map((s) => s.trim()).filter(Boolean) : [],
      }).unwrap();
      toast.success('Added');
      onClose();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-[#0F172A]">Add a pet</h2>
          <button type="button" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="flex rounded-2xl bg-slate-100 p-1">
          {SPECIES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => { setSpecies(s.value); set('breedCode', ''); }}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
                species === s.value ? 'bg-white text-[#0F172A] shadow' : 'text-slate-400'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Name"
          className="w-full rounded-xl border-2 border-slate-200 p-3" />

        <select value={form.breedCode} onChange={(e) => pickBreed(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 p-3 font-medium">
          <option value="">Breed (optional)</option>
          {breeds.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <select value={form.size} onChange={(e) => set('size', e.target.value)}
            className="w-full rounded-xl border-2 border-slate-200 p-3 font-medium">
            {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <input type="number" value={form.weight} onChange={(e) => set('weight', e.target.value)}
            placeholder="Weight (kg)" className="w-full rounded-xl border-2 border-slate-200 p-3" />
        </div>

        <select value={form.temperament} onChange={(e) => set('temperament', e.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 p-3 font-medium">
          {['unknown', 'calm', 'friendly', 'energetic', 'anxious', 'aggressive'].map((t) => (
            <option key={t} value={t}>{t === 'unknown' ? 'Temperament (optional)' : t[0].toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        <input value={form.allergies} onChange={(e) => set('allergies', e.target.value)}
          placeholder="Allergies, comma separated (optional)" className="w-full rounded-xl border-2 border-slate-200 p-3 text-sm" />
        <textarea value={form.specialNeeds} onChange={(e) => set('specialNeeds', e.target.value)}
          placeholder="Special needs or handling instructions (optional)" rows={2}
          className="w-full rounded-xl border-2 border-slate-200 p-3 text-sm" />

        <ImageUploadField value={photoKey} onChange={setPhotoKey} folder="pet/photos" label="photo" />

        <button type="button" onClick={save} disabled={isLoading}
          className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-50">
          {isLoading ? 'Saving…' : 'Add pet'}
        </button>
      </div>
    </div>
  );
}
