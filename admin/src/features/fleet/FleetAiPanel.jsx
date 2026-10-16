import { useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useLazyAdminFleetAiBriefingQuery, useAdminFleetAiAskMutation } from '@shared/services/api';

const ASKS = ['Why is my weakest hub losing money?', 'Who deserves a bonus this month?', 'Where should I hire next?'];

// Fleet AI (server workforce/fleet-ai): a briefing on request and questions answered from this month's fleet figures.
export default function FleetAiPanel({ month }) {
  const [getBrief, brief] = useLazyAdminFleetAiBriefingQuery();
  const [ask, asked] = useAdminFleetAiAskMutation();
  const [q, setQ] = useState('');
  const [thread, setThread] = useState([]);

  async function send(question) {
    const text = question.trim();
    if (text.length < 4 || asked.isLoading) return;
    setQ('');
    setThread((t) => [...t, { q: text, a: null }]);
    const r = await ask({ question: text, month }).unwrap().catch((e) => ({ text: e?.data?.error || 'The AI did not answer. Try again in a minute.', failed: true }));
    setThread((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: r.text, failed: r.failed } : x)));
  }

  return (
    <section className="rounded-2xl border border-[#1F4FD8]/25 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-[#1F4FD8]"><Sparkles size={14} /> Fleet AI</p>
        <button type="button" onClick={() => getBrief(month, false)} disabled={brief.isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1F4FD8] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
          {brief.isFetching ? <><Loader2 size={13} className="animate-spin" /> Reading the month…</> : brief.data ? 'Refresh briefing' : 'Brief me on this month'}
        </button>
      </div>
      {brief.isError && <p className="mt-2 text-[12.5px] text-amber-700">{brief.error?.data?.error || 'The AI did not answer just now.'}</p>}
      {brief.data && (
        <div className="mt-3 whitespace-pre-line rounded-xl bg-[#1F4FD8]/[0.04] px-4 py-3 text-[13.5px] leading-relaxed text-slate-800">
          {brief.data.text}
          <p className="mt-2 text-[11px] text-slate-400">Written by AI from this month&apos;s figures{brief.data.cached ? ', from the last hour' : ''}. Check the numbers below before acting.</p>
        </div>
      )}

      {thread.length > 0 && (
        <div className="mt-3 space-y-2">
          {thread.map((t, i) => (
            <div key={i} className="space-y-1">
              <p className="text-[12.5px] font-semibold text-slate-900">{t.q}</p>
              {t.a == null
                ? <p className="flex items-center gap-1.5 text-[12.5px] text-slate-500"><Loader2 size={12} className="animate-spin" /> Thinking…</p>
                : <p className={`whitespace-pre-line text-[13px] leading-relaxed ${t.failed ? 'text-amber-700' : 'text-slate-700'}`}>{t.a}</p>}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="mt-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="Ask about your fleet: hubs, people, money, where to grow" aria-label="Ask Fleet AI"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4FD8]/40" />
        <button type="submit" disabled={q.trim().length < 4 || asked.isLoading} aria-label="Ask" className="rounded-lg bg-slate-900 px-3 text-white disabled:opacity-40"><Send size={15} /></button>
      </form>
      {!thread.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ASKS.map((a) => <button key={a} type="button" onClick={() => send(a)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-medium text-slate-600 hover:bg-slate-200">{a}</button>)}
        </div>
      )}
    </section>
  );
}
