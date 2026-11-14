import { useRef, useState } from 'react';
import { ChevronsRight, Loader2 } from 'lucide-react';

const KNOB = 52;
const PAD = 4;
const DONE_AT = 0.85;

// Slide to confirm a step that must not happen by an accidental tap (the app's SwipeToConfirm); Enter or Space confirms from the keyboard.
export default function SwipeToConfirm({ label, onConfirm, disabled = false, loading = false }) {
  const track = useRef(null);
  const start = useRef(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const off = disabled || loading;
  const max = () => Math.max(0, (track.current?.offsetWidth || 0) - KNOB - PAD * 2);

  const finish = () => {
    setX(max());
    try { navigator.vibrate?.(35); } catch { /* not on this device */ }
    setTimeout(() => { Promise.resolve().then(onConfirm).catch(() => {}).finally(() => setX(0)); }, 120);
  };
  const down = (e) => {
    if (off) return;
    start.current = e.clientX - x;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => { if (dragging) setX(Math.min(Math.max(0, e.clientX - start.current), max())); };
  const up = () => {
    if (!dragging) return;
    setDragging(false);
    if (max() && x >= max() * DONE_AT) finish(); else setX(0);
  };
  const m = max() || 1;

  return (
    <div ref={track} role="button" tabIndex={off ? -1 : 0} aria-disabled={off} aria-label={`${label}. Slide right, or press Enter, to confirm`}
      onKeyDown={(e) => { if (!off && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); finish(); } }}
      className={`relative select-none overflow-hidden rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-zappy-400 ${off ? 'border-slate-200 bg-slate-100' : 'border-zappy-100 bg-zappy-50'}`}
      style={{ height: KNOB + PAD * 2, touchAction: 'pan-y' }}>
      <div className={`absolute inset-y-0 left-0 rounded-full ${off ? '' : 'bg-zappy-100'}`}
        style={{ width: x + KNOB + PAD * 2, transition: dragging ? 'none' : 'width 220ms cubic-bezier(.2,.8,.2,1)' }} />
      <span className={`pointer-events-none absolute inset-y-0 flex items-center justify-center text-[15px] font-bold ${off ? 'text-slate-400' : 'text-zappy-700'}`}
        style={{ left: KNOB + PAD * 2, right: PAD * 2, opacity: Math.max(0, 1 - x / (m * 0.6)) }}>{label}</span>
      <span onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className={`absolute flex items-center justify-center rounded-full text-white shadow-md ${off ? 'bg-slate-300 shadow-none' : 'cursor-grab bg-zappy-600 active:cursor-grabbing'}`}
        style={{ left: PAD, top: PAD, width: KNOB, height: KNOB, transform: `translateX(${x}px)`, transition: dragging ? 'none' : 'transform 220ms cubic-bezier(.2,.8,.2,1)' }}>
        {loading ? <Loader2 size={22} className="animate-spin" /> : <ChevronsRight size={24} strokeWidth={2.6} />}
      </span>
    </div>
  );
}
