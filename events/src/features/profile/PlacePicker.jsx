import { Check } from 'lucide-react';
import { TELANGANA_PLACES, placeName } from '@shared/constants/telanganaPlaces';

/** Choose the Telangana cities and towns served. Stores slugs; never free text. */
export default function PlacePicker({ value = [], onChange }) {
  const set = new Set(value.map((v) => String(v).toLowerCase()));
  const toggle = (slug) => onChange(set.has(slug) ? value.filter((v) => String(v).toLowerCase() !== slug) : [...value, slug]);
  const legacy = value.filter((v) => !TELANGANA_PLACES.some((p) => p.slug === String(v).toLowerCase()));

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {TELANGANA_PLACES.map((p) => {
          const on = set.has(p.slug);
          return (
            <button key={p.slug} type="button" onClick={() => toggle(p.slug)} aria-pressed={on}
              className={`flex min-h-[36px] items-center gap-1.5 rounded-btn border px-3 text-[13px] font-medium ${on ? 'border-zappy-600 bg-zappy-50 text-zappy-700' : 'border-line bg-white text-ink-700 hover:border-line-strong'}`}>
              {on && <Check size={14} />}{placeName(p.slug)}
            </button>
          );
        })}
      </div>
      {legacy.length > 0 && (
        <p className="mt-2 text-[12px] text-amber-700">
          Not in Telangana (remove these): {legacy.map((v) => (
            <button key={v} type="button" onClick={() => toggle(String(v).toLowerCase())} className="ml-1 underline">{v}</button>
          ))}
        </p>
      )}
    </div>
  );
}
