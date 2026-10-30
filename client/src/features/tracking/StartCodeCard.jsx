import { useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';

// Locked while the pro travels, asked "are they with you?" on arrival (shown anyway after 90 s), then the digits to read out.
const REVEAL_AFTER_S = 90;

function Digits({ code, hidden = false }) {
  return (
    <span className="flex shrink-0 gap-1.5" aria-label={hidden ? 'Start code hidden' : `Start code ${String(code).split('').join(' ')}`}>
      {String(code).split('').map((d, i) => (
        <span key={i} className={`grid h-9 w-8 place-items-center rounded-md text-[19px] font-bold tabular-nums ${hidden ? 'bg-sunken text-ink-300' : 'bg-ink-900 text-white'}`}>
          {hidden ? '•' : d}
        </span>
      ))}
    </span>
  );
}

export default function StartCodeCard({ jobKey, code, stage, noun = 'pro', framed = false }) {
  const storeKey = `start-code-ok:${jobKey}`;
  const [confirmed, setConfirmed] = useState(() => {
    try { return sessionStorage.getItem(storeKey) === '1'; } catch { return false; }
  });
  const [left, setLeft] = useState(REVEAL_AFTER_S);
  const timer = useRef(null);

  const confirm = () => {
    setConfirmed(true);
    try { sessionStorage.setItem(storeKey, '1'); } catch { /* private mode: reveal for this view */ }
  };

  useEffect(() => {
    if (stage !== 'arrived' || confirmed) return undefined;
    setLeft(REVEAL_AFTER_S);
    timer.current = setInterval(() => setLeft((s) => {
      if (s <= 1) { clearInterval(timer.current); confirm(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(timer.current);
  }, [stage, confirmed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!code || !['assigned', 'on_the_way', 'arrived'].includes(stage)) return null;
  const asking = stage === 'arrived' && !confirmed;
  const shown = stage === 'arrived' && confirmed;

  return (
    <div className={`flex items-center gap-3 py-3.5 ${framed ? 'rounded-card border border-line bg-white px-4' : ''}`}>
      <KeyRound size={18} className="shrink-0 text-ink-900" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-ink-900">{asking ? `Is your ${noun} with you?` : 'Start code for the job'}</span>
        <span className="block text-[12.5px] text-ink-500">
          {asking ? `It shows in ${left}s` : shown ? 'Give it only in person. ZappyOne never asks for it.' : `Shows when your ${noun} arrives`}
        </span>
      </span>
      {asking
        ? <button type="button" onClick={confirm} className="h-9 shrink-0 rounded-lg bg-ink-900 px-3.5 text-[13px] font-bold text-white">Yes, show</button>
        : <Digits code={code} hidden={!shown} />}
    </div>
  );
}
