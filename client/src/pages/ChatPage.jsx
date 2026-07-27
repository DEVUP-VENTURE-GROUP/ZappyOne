import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowLeft, Phone, Send, CheckCheck } from 'lucide-react';
import { selectAuth } from '../modules/auth/authSlice';
import { useOrderSocket } from '../hooks/useSocket';
import { useGetOrderQuery, useGetChatMessagesQuery, useSendChatMessageMutation } from '../services/api';
import { API_BASE } from '../services/apiBase';
import toast from 'react-hot-toast';

const CANNED = [
  { code: 'im_here', text: "I'm here, please come up" },
  { code: 'share_loc', text: 'Share your location' },
  { code: 'running', text: 'Running a few minutes late' },
  { code: 'thanks', text: 'Thank you!' },
];

export default function ChatPage() {
  const { id: orderId } = useParams();
  const nav = useNavigate();
  const { role, accessToken: token } = useSelector(selectAuth);
  const [text, setText] = useState('');
  // Local messages layer: history from RTK Query + real-time from socket
  const [localMessages, setLocalMessages] = useState(null); // null = not yet seeded
  const scrollerRef = useRef(null);
  const inputRef = useRef(null);

  const { data: orderData } = useGetOrderQuery(orderId);
  const { data: chatData } = useGetChatMessagesQuery({ orderId, limit: 50 });
  const [sendMsg, { isLoading: sending }] = useSendChatMessageMutation();

  // Seed local messages once the RTK Query result arrives
  useEffect(() => {
    if (chatData?.messages) {
      setLocalMessages(chatData.messages);
    }
  }, [chatData]);

  // Layer real-time socket messages on top of the seeded history
  useOrderSocket(orderId, {
    onChatMessage: (msg) => {
      setLocalMessages((prev) => {
        if (!prev) return [msg];
        if (prev.some((m) => String(m._id) === String(msg._id))) return prev;
        return [...prev, msg];
      });
    },
  });

  const messages = localMessages ?? [];

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function send(body, cannedCode) {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    try {
      const r = await sendMsg({ orderId, text: trimmed, cannedCode }).unwrap();
      setLocalMessages((prev) => {
        const list = prev ?? [];
        if (list.some((m) => String(m._id) === String(r.message._id))) return list;
        return [...list, r.message];
      });
      setText('');
      inputRef.current?.focus();
    } catch (err) {
      toast.error(err?.data?.error || 'Could not send');
    }
  }

  const order = orderData?.order;
  const otherParty = order
    ? role === 'user'
      ? { name: order.workerName || 'Worker' }
      : { name: order.userName || 'Customer' }
    : null;

  async function startCall() {
    try {
      const res = await fetch(`${API_BASE}/api/orders/${orderId}/call`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const r = await res.json().catch(() => ({}));
      if (res.ok && r.proxyNumber) { window.location.href = `tel:${r.proxyNumber}`; return; }
      // Surface the real reason (e.g. "Calling is only available during an active order").
      toast.error(r.error || 'Calling is available once a pro is assigned');
    } catch {
      toast.error('Could not start call');
    }
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-[#F9FAFB] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 shrink-0">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => nav(-1)} className="back-btn">
            <ArrowLeft size={18} strokeWidth={2.5} />
          </button>
          <div className="w-9 h-9 rounded-xl bg-zappy-gradient flex items-center justify-center text-white font-bold text-xs shrink-0">
            {(otherParty?.name || 'W').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#0F172A] text-sm truncate">{otherParty?.name || '…'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-success-500" />
              <span className="text-[10px] text-success-600 font-semibold">Online</span>
            </div>
          </div>
          <button
            onClick={startCall}
            className="w-9 h-9 rounded-xl bg-success-50 flex items-center justify-center"
            aria-label="Call"
          >
            <Phone size={16} strokeWidth={2} className="text-success-600" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-lg mx-auto space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-slate-400 font-medium">No messages yet</p>
              <p className="text-xs text-slate-300 mt-1">Start the conversation below</p>
            </div>
          )}

          {messages.map((m) => {
            const mine = m.from?.kind === role;
            return (
              <div key={String(m._id)} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%]">
                  <div className={mine ? 'bubble-out' : 'bubble-in'}>{m.text}</div>
                  <div className={`flex items-center gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[10px] text-slate-400">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {mine && <CheckCheck size={11} className="text-zappy-400" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Composer */}
      <div className="bg-white border-t border-slate-100 shrink-0 safe-pb flex flex-col">
        {/* Canned replies */}
        {messages.length === 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3 bg-[#F9FAFB] border-b border-slate-100/50">
            {CANNED.map((c) => (
              <button
                key={c.code}
                onClick={() => send(c.text, c.code)}
                disabled={sending}
                className="shrink-0 px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50 shadow-sm"
              >
                {c.text}
              </button>
            ))}
          </div>
        )}
        <div className="w-full max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-sm font-medium text-[#111827] outline-none focus:border-zappy-600 focus:ring-2 focus:ring-zappy-600/10 placeholder:text-slate-400 transition-all"
            placeholder="Type a message…"
          />
          <button
            onClick={() => send(text)}
            disabled={sending || !text.trim()}
            className="w-10 h-10 rounded-full bg-zappy-600 flex items-center justify-center disabled:opacity-40 transition-all active:scale-95 shadow-soft"
            aria-label="Send"
          >
            <Send size={15} strokeWidth={2.5} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
