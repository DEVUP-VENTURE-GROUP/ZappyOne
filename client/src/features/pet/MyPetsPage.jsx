import { useSafeBack } from '../../hooks/useBookingFlow';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, X, PawPrint, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useMyPetsQuery, useCreateMyPetMutation, useUpdateMyPetMutation, useDeleteMyPetMutation, usePetBreedsQuery,
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
  // Back to the previous page, or to /pet when this page was opened directly.
  const goBack = useSafeBack('/pet');
  const { data, isLoading } = useMyPetsQuery();
  const [deletePet] = useDeleteMyPetMutation();
  const [showAdd, setShowAdd] = useState(false);
  const pets = data?.pets || [];
  // "?complete=<id>" (from booking): open that pet's unanswered questions.
  const [params, setParams] = useSearchParams();
  const [finishing, setFinishing] = useState(null);
  const toFinish = finishing || pets.find((p) => p._id === params.get('complete')) || null;
  const closeFinish = () => { setFinishing(null); if (params.get('complete')) { params.delete('complete'); setParams(params, { replace: true }); } };

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
        <button type="button" onClick={() => goBack()} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
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
              {!p.safetyAnsweredAt && (
                <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setFinishing(p); }}
                  className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  Finish profile to book
                </span>
              )}
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

      {showAdd && <PetProfileSheet onClose={() => setShowAdd(false)} />}
      {toFinish && <PetProfileSheet key={toFinish._id} pet={toFinish} onClose={closeFinish} />}
    </div>
  );
}

/* What a provider must know before handling the animal (server pet.routes SAFETY). */
const GENDERS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }];
const AGES = [
  { value: 0.25, label: 'Under 6 months' }, { value: 0.75, label: '6–12 months' },
  ...Array.from({ length: 20 }, (_, i) => ({ value: i + 1, label: `${i + 1} year${i ? 's' : ''}` })),
];
const TEMPERAMENTS = [
  { value: 'calm', label: 'Calm' }, { value: 'friendly', label: 'Friendly' }, { value: 'energetic', label: 'Energetic' },
  { value: 'anxious', label: 'Nervous' }, { value: 'aggressive', label: 'Aggressive' },
];
const VACCINATION = [
  { value: 'up_to_date', label: 'Up to date' }, { value: 'partial', label: 'Some done' },
  { value: 'not_vaccinated', label: 'Not vaccinated' }, { value: 'unknown', label: 'Not sure' },
];
const BITE = [
  { value: 'none', label: 'Never' }, { value: 'medium', label: 'Once or twice' }, { value: 'high', label: 'Yes, may bite' },
];
const STRANGERS = [
  { value: 'none', label: 'Friendly' }, { value: 'low', label: 'Shy or wary' }, { value: 'high', label: 'Can get aggressive' },
];
const REQUIRED = ['size', 'gender', 'age', 'weight', 'temperament', 'vaccinationStatus', 'biteRisk', 'aggressionLevel'];
const ageOf = (dob) => {
  if (!dob) return '';
  const y = (Date.now() - new Date(dob).getTime()) / (365.25 * 86400e3);
  return AGES.reduce((best, a) => (Math.abs(a.value - y) < Math.abs(best.value - y) ? a : best)).value;
};

function Chips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-bold transition ${
            value === o.value ? 'border-zappy-500 bg-zappy-50 text-zappy-700' : 'border-slate-200 bg-white text-slate-600'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Question({ label, missing, children }) {
  return (
    <div className="space-y-1.5">
      <p className={`text-[13px] font-bold ${missing ? 'text-red-600' : 'text-[#0F172A]'}`}>{label}</p>
      {children}
    </div>
  );
}

/**
 * Add a pet, or finish an older profile (pet given). Name, size, gender, age,
 * weight, temperament, vaccination, biting and strangers are required: the
 * provider is matched and briefed on them (pet matching restricts bite and
 * aggression risk). Breed, photo, allergies and notes stay optional.
 */
export function PetProfileSheet({ pet, onClose }) {
  const editing = !!pet;
  const [species, setSpecies] = useState(pet?.species || 'dog');
  const answered = !!pet?.safetyAnsweredAt;
  const [form, setForm] = useState({
    name: pet?.name || '', breedCode: pet?.breedCode || '', breed: pet?.breed || '',
    size: pet?.size || '', weight: pet?.weight ?? '', gender: pet?.gender && pet.gender !== 'unknown' ? pet.gender : '',
    age: ageOf(pet?.dob),
    // On an older profile these were defaults, not answers: ask again.
    temperament: pet?.temperament && pet.temperament !== 'unknown' ? pet.temperament : '',
    vaccinationStatus: answered ? pet.vaccinationStatus : '',
    biteRisk: answered ? pet.biteRisk : '',
    aggressionLevel: answered ? pet.aggressionLevel : '',
    allergies: (pet?.allergies || []).join(', '), specialNeeds: pet?.specialNeeds || '',
  });
  const [photoKey, setPhotoKey] = useState(pet?.photoKey || '');
  const [tried, setTried] = useState(false);
  const { data: breedsData } = usePetBreedsQuery({ species });
  const [create, { isLoading: creating }] = useCreateMyPetMutation();
  const [update, { isLoading: updating }] = useUpdateMyPetMutation();
  const isLoading = creating || updating;

  const breeds = breedsData?.breeds || [];
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const missing = (k) => tried && (form[k] === '' || form[k] == null);

  function pickBreed(code) {
    const breed = breeds.find((b) => b.code === code);
    set('breedCode', code);
    set('breed', breed?.name || '');
    if (breed?.typicalSize && !form.size) set('size', breed.typicalSize);
  }

  async function save() {
    setTried(true);
    if (!form.name.trim()) { toast.error('Give your pet a name'); return; }
    const gaps = REQUIRED.filter((k) => form[k] === '' || form[k] == null);
    if (gaps.length) { toast.error('Please answer the questions in red. The provider needs them to handle your pet safely.'); return; }
    if (!(Number(form.weight) > 0)) { toast.error('Enter the weight in kg (a guess is fine)'); return; }
    const { age, ...rest } = form;
    const body = {
      ...rest,
      species,
      photoKey,
      weight: Number(form.weight),
      dob: new Date(Date.now() - age * 365.25 * 86400e3).toISOString(),
      allergies: form.allergies ? form.allergies.split(',').map((s) => s.trim()).filter(Boolean) : [],
    };
    try {
      if (editing) await update({ id: pet._id, ...body }).unwrap();
      else await create(body).unwrap();
      toast.success(editing ? 'Profile saved' : 'Added');
      onClose();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not save');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-sheet sm:rounded-card p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-[#0F172A]">{editing ? `Finish ${pet.name}’s profile` : 'Add a pet'}</h2>
          <button type="button" onClick={onClose}><X size={20} /></button>
        </div>

        {!editing && (
          <div className="flex rounded-2xl bg-slate-100 p-1">
            {SPECIES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => { setSpecies(s.value); set('breedCode', ''); set('breed', ''); }}
                className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
                  species === s.value ? 'bg-white text-[#0F172A] shadow' : 'text-slate-400'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Name"
          className={`w-full rounded-xl border-2 p-3 ${tried && !form.name.trim() ? 'border-red-300' : 'border-slate-200'}`} />

        <select value={form.breedCode} onChange={(e) => pickBreed(e.target.value)}
          className="w-full rounded-xl border-2 border-slate-200 p-3 font-medium">
          <option value="">Breed (optional, or mixed / indie)</option>
          {breeds.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </select>

        <p className="rounded-xl bg-zappy-50 px-3 py-2 text-[12px] leading-relaxed text-zappy-800">
          These help us send the right person with the right care. Every question below is needed to book.
        </p>

        <Question label="Gender" missing={missing('gender')}>
          <Chips options={GENDERS} value={form.gender} onChange={(v) => set('gender', v)} />
        </Question>

        <Question label="Size" missing={missing('size')}>
          <Chips options={SIZES} value={form.size} onChange={(v) => set('size', v)} />
        </Question>

        <div className="grid grid-cols-2 gap-2">
          <Question label="Age" missing={missing('age')}>
            <select value={form.age} onChange={(e) => set('age', e.target.value === '' ? '' : Number(e.target.value))}
              className={`w-full rounded-xl border-2 p-3 font-medium ${missing('age') ? 'border-red-300' : 'border-slate-200'}`}>
              <option value="">Choose</option>
              {AGES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </Question>
          <Question label="Weight (kg)" missing={missing('weight')}>
            <input type="number" inputMode="decimal" value={form.weight} onChange={(e) => set('weight', e.target.value)}
              placeholder="A guess is fine" className={`w-full rounded-xl border-2 p-3 ${missing('weight') ? 'border-red-300' : 'border-slate-200'}`} />
          </Question>
        </div>

        <Question label="Usual mood" missing={missing('temperament')}>
          <Chips options={TEMPERAMENTS} value={form.temperament} onChange={(v) => set('temperament', v)} />
        </Question>

        <Question label="Vaccinations" missing={missing('vaccinationStatus')}>
          <Chips options={VACCINATION} value={form.vaccinationStatus} onChange={(v) => set('vaccinationStatus', v)} />
        </Question>

        <Question label="Has your pet ever bitten or snapped at someone?" missing={missing('biteRisk')}>
          <Chips options={BITE} value={form.biteRisk} onChange={(v) => set('biteRisk', v)} />
        </Question>

        <Question label="With strangers, your pet is…" missing={missing('aggressionLevel')}>
          <Chips options={STRANGERS} value={form.aggressionLevel} onChange={(v) => set('aggressionLevel', v)} />
        </Question>

        <p className="pt-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">Optional</p>
        <input value={form.allergies} onChange={(e) => set('allergies', e.target.value)}
          placeholder="Allergies, comma separated" className="w-full rounded-xl border-2 border-slate-200 p-3 text-sm" />
        <textarea value={form.specialNeeds} onChange={(e) => set('specialNeeds', e.target.value)}
          placeholder="Special needs or handling instructions" rows={2}
          className="w-full rounded-xl border-2 border-slate-200 p-3 text-sm" />

        <ImageUploadField value={photoKey} onChange={setPhotoKey} folder="pet/photos" label="photo" />

        <button type="button" onClick={save} disabled={isLoading}
          className="w-full rounded-2xl bg-[#0F172A] text-white font-bold py-4 disabled:opacity-50">
          {isLoading ? 'Saving…' : editing ? 'Save profile' : 'Add pet'}
        </button>
      </div>
    </div>
  );
}
