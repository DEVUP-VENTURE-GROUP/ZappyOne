import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { X, Send, Loader2, MessageCircle, Check, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { selectAuth } from '../../modules/auth/authSlice';
import { getSocket } from '../../services/socket';
import { api, useJobChatQuery, useSendJobChatMutation } from '../../services/api';

/**
 * Messages about one job, between the customer and whoever is doing it. A
 * sheet on a phone, a side panel on a computer. New messages arrive live on
 * the reader's own channel; quick replies cover what people say most.
 *
 *   jobId     the booking
 *   title     who you are talking to ("Ravi K.", "Your customer")
 */
const QUICK = {
  user: ['Where are you now?', 'I am at home', 'Please call me when you arrive', 'Ring the bell, I am inside'],
  provider: ['I am on my way', 'I have reached, coming up', 'Running 10 minutes late, sorry', 'Please share the gate or flat number'],
};

function time(at) {
  return new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function JobChat({ jobId, title = 'Messages', onClose }) {
  const dispatch = useDispatch();
  const { accessToken, role } = useSelector(selectAuth);
  const { data, isLoading } = useJobChatQuery(jobId);
  const [send, { isLoading: sending }] = useSendJobChatMutation();
  const [text, setText] = useState('');
  const listRef = useRef(null);

  // A message for this job anywhere in the app refreshes the thread.
  useEffect(() => {
    if (!accessToken) return undefined;
    const socket = getSocket(accessToken);
    const onMessage = (p) => { if (p?.jobId === String(jobId)) dispatch(api.util.invalidateTags([{ type: 'JobChat', id: jobId }])); };
    socket.on('chat.message', onMessage);
    return () => socket.off('chat.message', onMessage);
  }, [accessToken, jobId, dispatch]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages?.length]);

  async function submit(body) {
    const t = String(body ?? text).trim();
    if (!t) return;
    try {
      await send({ id: jobId, text: t }).unwrap();
      if (body == null) setText('');
    } catch (err) { toast.error(err?.data?.error || 'Message not sent. Try again.'); }
  }

  const quick = QUICK[role === 'user' ? 'user' : 'provider'];
  const messages = data?.messages || [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-900/40 sm:items-stretch sm:justify-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.section initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} transition={{ duration: 0.18 }}
        aria-label="Messages"
        className="flex h-[85vh] w-full flex-col rounded-t-sheet bg-white sm:h-full sm:max-w-md sm:rounded-none">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zappy-50 text-zappy-700"><MessageCircle size={17} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-bold text-ink-900">{title}</span>
            <span className="block text-[12px] text-ink-500">Messages stay with this booking</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-btn hover:bg-sunken"><X size={18} /></button>
        </header>

        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-canvas px-4 py-4">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-zappy-600" /></div>
          ) : !messages.length ? (
            <p className="py-10 text-center text-[14px] text-ink-500">{data?.open === false ? data.reason : 'No messages yet. Say hello or use a quick reply.'}</p>
          ) : messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-card px-3.5 py-2 text-[15px] leading-snug ${m.mine ? 'rounded-br-chip bg-zappy-600 text-white' : 'rounded-bl-chip border border-line bg-white text-ink-900'}`}>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${m.mine ? 'text-white/75' : 'text-ink-400'}`}>
                  {time(m.at)}
                  {m.mine && (m.readAt ? <CheckCheck size={13} aria-label="Read" /> : <Check size={13} aria-label="Sent" />)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {data?.open === false ? (
          <p className="border-t border-line px-4 py-3 text-center text-[13px] text-ink-500">{data.reason}</p>
        ) : (
          <div className="border-t border-line bg-white px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-2">
            <div className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 no-scrollbar">
              {quick.map((q) => (
                <button key={q} type="button" onClick={() => submit(q)} disabled={sending}
                  className="min-h-[34px] shrink-0 rounded-full border border-line bg-white px-3 text-[13px] font-medium text-ink-700 hover:border-line-strong">{q}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2">
              <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Type a message"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                className="input max-h-32 min-h-[44px] flex-1 resize-none py-2.5" aria-label="Message" />
              <button type="submit" disabled={sending || !text.trim()} aria-label="Send" className="btn-primary h-11 w-11 shrink-0 px-0">
                {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              </button>
            </form>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}
