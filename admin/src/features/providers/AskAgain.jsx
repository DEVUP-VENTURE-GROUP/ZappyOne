import { useState } from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Ask a provider to send named documents again. The same block on every
 * identity check (workers, shops, event partners): tick what needs a new copy,
 * say why, send. The application stays in review; the provider is shown only
 * those documents to replace, and everything else they sent is kept.
 */
export default function AskAgain({ docs, onSend }) {
  const [picked, setPicked] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (code) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  async function send() {
    if (!picked.length) return toast.error('Tick the documents they should send again');
    if (message.trim().length < 5) return toast.error('Tell them what to fix');
    setBusy(true);
    try {
      await onSend({ docCodes: picked, message: message.trim() });
      toast.success(`Asked for ${picked.length} document${picked.length > 1 ? 's' : ''} again - they have been notified`);
      setPicked([]); setMessage('');
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send');
    } finally { setBusy(false); }
    return undefined;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <p className="text-xs font-bold text-amber-800">Ask for documents again</p>
      <p className="mt-0.5 text-[11px] text-amber-700">They re-upload only what you tick; everything else stays as sent.</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {docs.map((d) => (
          <label key={d.code} className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={picked.includes(d.code)} onChange={() => toggle(d.code)} />
            {d.label}
          </label>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="What to fix, e.g. the photo is blurry"
          className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button type="button" onClick={send} disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Ask again
        </button>
      </div>
    </div>
  );
}
