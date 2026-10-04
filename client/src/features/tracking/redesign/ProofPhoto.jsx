import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

/**
 * Individual proof-of-work photo tile. Handles loading + error states
 * in-place so a broken image never leaves a blank white box.
 */
export default function ProofPhoto({ url, index }) {
  const [state, setState] = useState('loading'); // loading | loaded | error
  if (!url) return null;

  return (
    <a
      href={state === 'loaded' ? url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl overflow-hidden ring-1 ring-slate-100 hover:ring-green-300 transition bg-slate-50"
      onClick={state !== 'loaded' ? (e) => e.preventDefault() : undefined}
    >
      <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
        {state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={18} className="animate-spin text-slate-300" />
          </div>
        )}
        {state === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-50">
            <AlertCircle size={20} className="text-slate-300" />
            <p className="text-[10px] text-slate-400 font-medium">Photo unavailable</p>
          </div>
        )}
        <img
          src={url}
          alt={`Work proof ${index + 1}`}
          className={`w-full h-full object-cover transition-opacity duration-300 ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      </div>
    </a>
  );
}
