import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, Send, CheckCircle, XCircle, Loader2, RefreshCw,
  BarChart2, MessageSquare, Users, Smartphone, AlertTriangle,
} from 'lucide-react';
import { SectionHeader, Card } from './_shared';
import toast from 'react-hot-toast';
import {
  useLazyAdminNotificationHealthQuery,
  useLazyAdminNotificationStatsQuery,
  useAdminSendNotificationMutation,
  useAdminBroadcastNotificationMutation,
  useAdminMetricsQuery,
} from '@client/services/api';

const NOTIFICATION_TYPES = [
  'order_placed', 'worker_assigned', 'worker_on_the_way', 'worker_arriving_soon',
  'worker_arrived', 'order_completed', 'order_cancelled', 'rating_request',
  'wallet_credited', 'cashback_received', 'kyc_approved', 'kyc_rejected',
  'promotional', 'system_alert', 'worker_wellness', 'dispute_response', 'chat_message',
];

function StatCard({ label, value, sub, color = 'text-slate-800' }) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 text-center">
      <p className={`text-2xl font-black ${color}`}>{value ?? '—'}</p>
      <p className="text-xs font-bold text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── FCM Health Check ─────────────────────────────────────────────────── */
function FcmHealth() {
  const [checkHealth, { data, isFetching: loading, error }] = useLazyAdminNotificationHealthQuery();
  const health = data ?? (error ? { ok: false, message: 'Failed to check — try again' } : null);

  function check() { checkHealth(); }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone size={15} strokeWidth={2} className="text-indigo-600" />
          <p className="text-sm font-bold text-slate-700">Firebase / FCM Status</p>
        </div>
        <button onClick={check} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl disabled:opacity-50">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Check
        </button>
      </div>

      {health && (
        <div className={`flex items-start gap-3 p-3 rounded-xl ring-1 ${health.ok ? 'bg-green-50 ring-green-100' : 'bg-red-50 ring-red-100'}`}>
          {health.ok
            ? <CheckCircle size={15} strokeWidth={2} className="text-green-600 mt-0.5 shrink-0" />
            : <XCircle size={15} strokeWidth={2} className="text-red-500 mt-0.5 shrink-0" />
          }
          <div>
            <p className={`text-xs font-bold ${health.ok ? 'text-green-800' : 'text-red-800'}`}>{health.message}</p>
            {health.projectId && <p className="text-[10px] text-slate-400 mt-0.5">Project: {health.projectId}</p>}
            {health.error && <p className="text-[10px] text-red-600 mt-0.5">{health.error}</p>}
          </div>
        </div>
      )}

      <div className="bg-slate-50 rounded-xl p-3 text-[10px] text-slate-400 space-y-0.5">
        <p className="font-bold text-slate-600 text-[11px]">Required env vars (server)</p>
        {['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'].map((k) => (
          <p key={k} className="font-mono">{k}</p>
        ))}
        <p className="font-bold text-slate-600 text-[11px] pt-1">Required env vars (client)</p>
        {['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_VAPID_KEY'].map((k) => (
          <p key={k} className="font-mono">{k}</p>
        ))}
      </div>
    </Card>
  );
}

/* ── Delivery Stats ──────────────────────────────────────────────────── */
function DeliveryStats() {
  const [days, setDays] = useState(7);
  const [loadStats, { data: stats, isFetching: loading }] = useLazyAdminNotificationStatsQuery();

  function load() {
    loadStats(days).unwrap().catch(() => toast.error('Failed to load stats'));
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} strokeWidth={2} className="text-violet-600" />
          <p className="text-sm font-bold text-slate-700">Delivery Statistics</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none">
            <option value={1}>24h</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-violet-600 bg-violet-50 rounded-xl disabled:opacity-50">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Load
          </button>
        </div>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total sent" value={stats.summary.total} />
            <StatCard label="Push delivered" value={stats.summary.pushSent} color="text-indigo-600"
              sub={`${stats.summary.pushDeliveryRate}% rate`} />
            <StatCard label="SMS sent" value={stats.summary.smsSent} color="text-green-600" />
            <StatCard label="Read" value={stats.summary.read} color="text-amber-600" />
          </div>

          {/* Per-type breakdown */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">By type</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] font-bold text-slate-400 uppercase border-b border-slate-100">
                    {['Type', 'Total', 'Push', 'SMS', 'Read'].map((h) => (
                      <th key={h} className="text-left py-1.5 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {stats.byType.map((t) => (
                    <tr key={t._id} className="hover:bg-slate-50">
                      <td className="py-1.5 pr-3 font-medium capitalize">{t._id?.replace(/_/g, ' ')}</td>
                      <td className="py-1.5 pr-3">{t.total}</td>
                      <td className="py-1.5 pr-3 text-indigo-600">{t.pushSent}</td>
                      <td className="py-1.5 pr-3 text-green-600">{t.smsSent}</td>
                      <td className="py-1.5 pr-3 text-amber-600">{t.readCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {stats.recentFailures?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <AlertTriangle size={10} /> Recent push failures
              </p>
              <div className="space-y-1">
                {stats.recentFailures.slice(0, 5).map((f, i) => (
                  <div key={i} className="text-[10px] bg-red-50 rounded-lg px-2.5 py-1.5 ring-1 ring-red-100">
                    <span className="font-bold text-red-700">{f.type}</span>
                    <span className="text-slate-400 ml-2">{f.title}</span>
                    <span className="text-red-400 ml-2">{f.channels?.push?.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ── Live Preview Component ──────────────────────────────────────────── */
function NotificationPreview({ title, body, type }) {
  return (
    <div className="sticky top-6">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Live Preview</p>
      <div className="relative rounded-[2rem] p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 shadow-2xl overflow-hidden ring-1 ring-white/10">
        {/* Glossy lighting */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/10 pointer-events-none" />
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-32 h-32 bg-blue-500/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-32 h-32 bg-orange-500/20 rounded-full blur-3xl pointer-events-none" />
        
        {/* Mock Screen Context */}
        <div className="h-6 flex justify-between items-center px-2 mb-2 text-white/50 text-[10px] font-medium">
          <span>9:41</span>
          <div className="flex gap-1.5">
            <span className="w-3 h-2 rounded-[2px] border border-white/50 relative after:content-[''] after:absolute after:right-[-2px] after:top-[2px] after:h-1 after:w-0.5 after:bg-white/50"></span>
          </div>
        </div>

        {/* The Notification Bubble */}
        <motion.div 
          key={`${title}-${body}`} // Remount on change for a subtle jump effect
          initial={{ y: 5, opacity: 0.8, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="bg-white/95 backdrop-blur-xl rounded-[1.2rem] p-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.15)] flex gap-3 relative border border-white/50 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/60 to-transparent pointer-events-none" />
          
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 shadow-inner relative z-10 border border-slate-200/50 p-1">
             <img src="/branding/zappylogo.png" className="w-full h-full object-contain drop-shadow-sm" alt="Zappy" />
          </div>
          <div className="flex-1 min-w-0 relative z-10">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-bold text-slate-800 tracking-wide">ZAPPY</span>
              <span className="text-[10px] font-medium text-slate-400">now</span>
            </div>
            <h4 className="text-[13px] font-bold text-slate-900 truncate leading-tight">
              {title || 'Notification title'}
            </h4>
            <p className="text-[12px] text-slate-600 line-clamp-2 mt-0.5 leading-snug">
              {body || 'Your notification body text goes here. Make it catchy!'}
            </p>
          </div>
        </motion.div>
        
        {/* Screen Bottom Bar */}
        <div className="mt-16 flex justify-center pb-1">
           <div className="w-1/3 h-1 bg-white/20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/* ── Manual Send ─────────────────────────────────────────────────────── */
function ManualSend() {
  const [form, setForm] = useState({
    recipientKind: 'user',
    recipientId: '',
    type: 'system_alert',
    title: '',
    body: '',
    deepLink: '',
  });
  const [sendNotification, { isLoading: sending }] = useAdminSendNotificationMutation();

  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function send() {
    if (!form.recipientId.match(/^[a-f\d]{24}$/i)) {
      toast.error('Enter a valid 24-char MongoDB ID');
      return;
    }
    if (!form.title.trim()) { toast.error('Title required'); return; }
    try {
      await sendNotification(form).unwrap();
      toast.success('Notification sent');
      setForm((p) => ({ ...p, recipientId: '', title: '', body: '', deepLink: '' }));
    } catch (e) {
      toast.error(e.data?.error || 'Send failed');
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6 items-start">
      <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Send size={15} strokeWidth={2} className="text-blue-600" />
        <p className="text-sm font-bold text-slate-700">Send to Specific User / Worker</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Recipient</label>
          <select value={form.recipientKind} onChange={f('recipientKind')}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400">
            <option value="user">User</option>
            <option value="worker">Worker</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">ID (MongoDB)</label>
          <input value={form.recipientId} onChange={f('recipientId')} placeholder="64a1b2c3..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400 font-mono" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Type</label>
          <select value={form.type} onChange={f('type')}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400">
            {NOTIFICATION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Deep Link</label>
          <input value={form.deepLink} onChange={f('deepLink')} placeholder="/orders/..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400" />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Title *</label>
        <input value={form.title} onChange={f('title')} placeholder="Notification title"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400" />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Body</label>
        <textarea value={form.body} onChange={f('body')} rows={2} placeholder="Notification body text"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400 resize-none" />
      </div>

      <motion.button onClick={send} disabled={sending}
        className="w-full py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
        whileTap={{ scale: 0.97 }}>
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {sending ? 'Sending…' : 'Send Notification'}
      </motion.button>
      </Card>
      <NotificationPreview title={form.title} body={form.body} type={form.type} />
    </div>
  );
}

/* ── Broadcast ────────────────────────────────────────────────────────── */
function Broadcast() {
  const [form, setForm] = useState({ recipientKind: 'user', type: 'promotional', title: '', body: '', deepLink: '', limit: 1000 });
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState(null);
  const [broadcast, { isLoading: sending }] = useAdminBroadcastNotificationMutation();
  const { data: metrics } = useAdminMetricsQuery();
  const f = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const isWorkers = form.recipientKind === 'worker';
  const audienceTotal = isWorkers ? metrics?.totalWorkers : metrics?.totalUsers;
  const audienceLabel = isWorkers ? 'workers' : 'users';

  async function send() {
    try {
      const data = await broadcast(form).unwrap();
      setResult(data);
      setConfirm(false);
    } catch (e) {
      toast.error(e.data?.error || 'Broadcast failed');
    }
  }

  // ── Animated success state ──
  if (result) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-1 relative"
          >
            <motion.span
              className="absolute inset-0 rounded-full bg-green-400/40"
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 1.1, repeat: 2 }}
            />
            <CheckCircle size={40} strokeWidth={2.5} className="text-green-600" />
          </motion.div>
          <motion.h3 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="text-lg font-black text-slate-900 mt-3">Broadcast sent 🎉</motion.h3>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
            className="text-xs text-slate-500 mt-1">"{form.title}" delivered to your {form.recipientKind}s</motion.p>

          <div className="grid grid-cols-2 gap-3 w-full mt-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="bg-slate-50 rounded-2xl p-4">
              <p className="text-2xl font-black text-slate-900">{result.inAppDelivered ?? result.recipientCount ?? 0}</p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">Delivered in-app</p>
              <p className="text-[9px] text-green-600 font-bold mt-1">✓ Guaranteed — can't be missed</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
              className="bg-slate-50 rounded-2xl p-4">
              <p className="text-2xl font-black text-slate-900">{result.pushTokenCount ?? 0}</p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">Push devices</p>
              <p className="text-[9px] text-slate-400 font-bold mt-1">Bonus channel</p>
            </motion.div>
          </div>

          <button onClick={() => { setResult(null); setForm((p) => ({ ...p, title: '', body: '' })); }}
            className="mt-6 w-full py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition">
            Send another
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6 items-start">
      <Card className="p-5 space-y-4 relative overflow-hidden">
      {/* Sending overlay — animated paper plane */}
      {sending && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <motion.div
            animate={{ x: [-8, 8, -8], y: [4, -4, 4] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Send size={24} className="text-white" />
          </motion.div>
          <p className="text-sm font-bold text-slate-700">Broadcasting to your {form.recipientKind}s…</p>
        </motion.div>
      )}

      <div className="flex items-center gap-2">
        <Users size={15} strokeWidth={2} className="text-orange-600" />
        <p className="text-sm font-bold text-slate-700">Broadcast to All</p>
        <span className="text-[10px] font-bold bg-orange-50 text-orange-600 ring-1 ring-orange-100 px-2 py-0.5 rounded-full">Admin only</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Audience</label>
          <select value={form.recipientKind} onChange={f('recipientKind')}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none">
            <option value="user">All Users{metrics?.totalUsers != null ? ` (${metrics.totalUsers.toLocaleString('en-IN')})` : ''}</option>
            <option value="worker">All Workers{metrics?.totalWorkers != null ? ` (${metrics.totalWorkers.toLocaleString('en-IN')})` : ''}</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Type</label>
          <select value={form.type} onChange={f('type')}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none">
            <option value="promotional">Promotional</option>
            <option value="system_alert">System Alert</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Max recipients</label>
          <input type="number" value={form.limit} onChange={f('limit')} min="1" max="100000"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none" />
          <p className="text-[10px] text-slate-400 mt-1">
            {audienceTotal != null ? `${audienceTotal.toLocaleString('en-IN')} total ${audienceLabel}` : 'loading…'}
            {audienceTotal != null && (
              <button type="button"
                onClick={() => setForm((p) => ({ ...p, limit: audienceTotal }))}
                className="ml-1.5 font-semibold text-orange-600 hover:underline">
                send to all
              </button>
            )}
          </p>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Title *</label>
        <input value={form.title} onChange={f('title')} placeholder="Broadcast title"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none" />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Body</label>
        <textarea value={form.body} onChange={f('body')} rows={2}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none resize-none" />
      </div>

      {!confirm ? (
        <button onClick={() => { if (!form.title) { toast.error('Title required'); return; } setConfirm(true); }}
          className="w-full py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl">
          Broadcast to {form.recipientKind === 'user' ? 'Users' : 'Workers'} →
        </button>
      ) : (
        <div className="bg-orange-50 rounded-xl p-3 ring-1 ring-orange-200 space-y-3">
          <p className="text-xs font-bold text-orange-800">⚠️ This will send to up to {form.limit} {form.recipientKind}s. Confirm?</p>
          <div className="flex gap-2">
            <button onClick={send} disabled={sending}
              className="flex-1 py-2 bg-orange-600 text-white text-xs font-bold rounded-xl disabled:opacity-50">
              {sending ? 'Sending…' : 'Yes, Send'}
            </button>
            <button onClick={() => setConfirm(false)} className="px-4 py-2 bg-slate-100 text-xs font-bold rounded-xl">Cancel</button>
          </div>
        </div>
      )}
      </Card>
      <NotificationPreview title={form.title} body={form.body} type={form.type} />
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────── */
export default function NotificationsAdmin() {
  const [tab, setTab] = useState('stats');

  const tabs = [
    { id: 'stats',   label: 'Stats & Health', icon: BarChart2 },
    { id: 'send',    label: 'Send',            icon: Send },
    { id: 'broadcast', label: 'Broadcast',     icon: Users },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <SectionHeader
        title="Push Notifications"
        subtitle="Monitor delivery, send manual pushes, broadcast platform-wide announcements, and verify Firebase config."
      />

      {/* Tab bar */}
      <div className="flex gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
              tab === id
                ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'stats' && (
        <div className="space-y-4">
          <FcmHealth />
          <DeliveryStats />
        </div>
      )}
      {tab === 'send' && <ManualSend />}
      {tab === 'broadcast' && <Broadcast />}
    </div>
  );
}
