import { useState } from 'react';
import { Star } from 'lucide-react';

// Five stars and one button, right where the job ends.
export default function RatingPanel({ onRate, name }) {
  const [value, setValue] = useState(0);
  return (
    <div className="rounded-card border border-line bg-white p-4">
      <p className="text-center text-[15px] font-bold text-ink-900">How was {name || 'the service'}?</p>
      <div className="mt-2 flex justify-center gap-1.5" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setValue(n)} className="p-1">
            <Star size={32} strokeWidth={1.5} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-ink-300'} />
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onRate(value)} disabled={!value} className="btn-primary mt-3 w-full disabled:opacity-40">Submit rating</button>
    </div>
  );
}
