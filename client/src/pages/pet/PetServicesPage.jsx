import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Scissors, Home, Footprints, HeartHandshake, Car, Stethoscope,
  ClipboardCheck, PawPrint, Calendar, Repeat, History, ChevronRight,
} from 'lucide-react';
import { usePetCategoriesQuery } from '../../services/api';

/**
 * Pet Services entry (§3, §53).
 *
 * The seven category cards come from the backend, never a hardcoded list —
 * an operator can add an eighth category from admin and it appears here with
 * no client change. The icon lookup below is presentation only; nothing
 * about what is bookable is decided by this file.
 */
const ICONS = {
  pet_grooming: Scissors, pet_boarding: Home, pet_walk: Footprints,
  pet_home_care: HeartHandshake, pet_transport: Car, pet_vet_assist: Stethoscope,
  pet_check: ClipboardCheck,
};

const QUICK_LINKS = [
  { key: 'pets', label: 'My Pets', icon: PawPrint, path: '/pet/my-pets' },
  { key: 'upcoming', label: 'Upcoming', icon: Calendar, path: '/pet/bookings?status=upcoming' },
  { key: 'recurring', label: 'Recurring Care', icon: Repeat, path: '/pet/recurring' },
  { key: 'history', label: 'History', icon: History, path: '/pet/bookings?status=history' },
];

export default function PetServicesPage() {
  const nav = useNavigate();
  const { data, isLoading } = usePetCategoriesQuery();
  const categories = data?.categories || [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={() => nav(-1)} className="p-1 -ml-1"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-black text-[#0F172A]">Pet Services</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        <p className="text-sm text-slate-500">Care for your dog or cat, from a trusted, verified provider.</p>

        <div className="grid grid-cols-4 gap-2">
          {QUICK_LINKS.map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.key}
                type="button"
                onClick={() => nav(q.path)}
                className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-slate-200 bg-white p-3 text-center"
              >
                <Icon size={18} className="text-indigo-600" />
                <span className="text-[10.5px] font-bold text-slate-600 leading-tight">{q.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          {isLoading && <p className="text-center text-sm text-slate-400 py-8">Loading…</p>}
          {categories.map((c) => {
            const Icon = ICONS[c.code] || PawPrint;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => nav(`/pet/book/${c.code}`)}
                className="w-full flex items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left hover:border-indigo-300 transition"
              >
                <span className="shrink-0 w-12 h-12 rounded-2xl bg-indigo-50 grid place-items-center">
                  <Icon size={20} className="text-indigo-600" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-black text-[#0F172A]">{c.name}</span>
                  {c.description && <span className="block text-xs text-slate-500 mt-0.5">{c.description}</span>}
                </span>
                <ChevronRight size={18} className="text-slate-300 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
