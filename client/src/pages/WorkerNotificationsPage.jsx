import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Bell, CheckCheck, Briefcase, Wallet,
  Shield, AlertTriangle, MessageSquare, Star, Zap,
  Clock, ChevronRight, FileCheck, BadgeIndianRupee,
  Trophy, TriangleAlert,
} from 'lucide-react';
import {
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} from '../services/api';
import { useSelector } from 'react-redux';
import { selectAuth } from '../modules/auth/authSlice';
import { getSocket } from '../services/socket';
import toast from 'react-hot-toast';

/* ─── Worker-specific type → visual config ──────────────────────────────── */
const TYPE_CFG = {
  // KYC
  kyc_approved:         { emoji: '✅', label: 'KYC Approved',      bg: 'bg-green-50',  ring: 'ring-green-200',  color: 'text-green-700',  Icon: FileCheck          },
  kyc_rejected:         { emoji: '🚫', label: 'KYC Rejected',      bg: 'bg-red-50',    ring: 'ring-red-200',    color: 'text-red-700',    Icon: AlertTriangle      },
  kyc_clarification:    { emoji: '📋', label: 'KYC Query',         bg: 'bg-amber-50',  ring: 'ring-amber-200',  color: 'text-amber-700',  Icon: MessageSquare      },

  // Jobs
  order_cancelled:      { emoji: '❌', label: 'Job Cancelled',     bg: 'bg-red-50',    ring: 'ring-red-200',    color: 'text-red-700',    Icon: Briefcase          },
  job_assigned:         { emoji: '⚡', label: 'Job Assigned',      bg: 'bg-indigo-50', ring: 'ring-indigo-200', color: 'text-indigo-700', Icon: Briefcase          },
  order_completed:      { emoji: '🏆', label: 'Job Completed',     bg: 'bg-amber-50',  ring: 'ring-amber-200',  color: 'text-amber-700',  Icon: Trophy             },

  // Earnings & wallet
  shield_payout:        { emoji: '💪', label: 'Shield Payout',     bg: 'bg-indigo-50', ring: 'ring-indigo-200', color: 'text-indigo-700', Icon: Shield             },
  worker_earning:       { emoji: '💰', label: 'Earnings',          bg: 'bg-green-50',  ring: 'ring-green-200',  color: 'text-green-700',  Icon: BadgeIndianRupee   },
  wallet_credited:      { emoji: '💰', label: 'Money In',          bg: 'bg-green-50',  ring: 'ring-green-200',  color: 'text-green-700',  Icon: Wallet             },
  penalty_applied:      { emoji: '⚠️', label: 'Penalty',           bg: 'bg-red-50',    ring: 'ring-red-200',    color: 'text-red-700',    Icon: TriangleAlert      },
  milestone_reached:    { emoji: '🎯', label: 'Milestone Bonus',   bg: 'bg-purple-50', ring: 'ring-purple-200', color: 'text-purple-700', Icon: Trophy             },
  rating_received:      { emoji: '⭐', label: 'New Rating',        bg: 'bg-amber-50',  ring: 'ring-amber-200',  color: 'text-amber-700',  Icon: Star               },

  // Fee / cancellation (worker receives info)
  cancellation_fee_charged:  { emoji: '🔔', label: 'Fee Charged', bg: 'bg-blue-50',   ring: 'ring-blue-200',   color: 'text-blue-700',   Icon: Wallet             },
  cancellation_fee_pending:  { emoji: '⏳', label: 'Fee Pending', bg: 'bg-amber-50',  ring: 'ring-amber-200',  color: 'text-amber-700',  Icon: Clock              },
  cancellation_warning:      { emoji: '⚠️', label: 'Warning',     bg: 'bg-amber-50',  ring: 'ring-amber-200',  color: 'text-amber-700',  Icon: AlertTriangle      },

  // System
  system_alert:         { emoji: '🔔', label: 'Alert',             bg: 'bg-slate-50',  ring: 'ring-slate-200',  color: 'text-slate-600',  Icon: Bell               },
  promotional:          { emoji: '🔥', label: 'Update',            bg: 'bg-orange-50', ring: 'ring-orange-200', color: 'text-orange-700', Icon: Zap                },
};
const DEFAULT_CFG = { emoji: '🔔', label: 'Notification', bg: 'bg-slate-50', ring: 'ring-slate-200', color: 'text-slate-600', Icon: Bell };

/* ─── Tab filter config ─────────────────────────────────────────────────── */
const TABS = [
  { id: 'all',      label: 'All'      },
  { id: 'jobs',     label: 'Jobs'     },
  { id: 'earnings', label: 'Earnings' },
  { id: 'kyc',      label: 'KYC'      },
];
const TAB_TYPES = {
  jobs:     ['order_cancelled', 'job_assigned', 'order_completed'],
  earnings: ['shield_payout', 'worker_earning', 'wallet_credited', 'penalty_applied', 'milestone_reached'],
  kyc:      ['kyc_approved', 'kyc_rejected', 'kyc_clarification'],
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function timeAgo(d) {
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

function groupByDay(items) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest  = new Date(today); yest.setDate(today.getDate() - 1);
  const g     = { today: [], yesterday: [], earlier: [] };
  for (const n of items) {
    const d = new Date(n.createdAt); d.setHours(0, 0, 0, 0);
    if (d >= today)  g.today.push(n);
    else if (d >= yest) g.yesterday.push(n);
    else g.earlier.push(n);
  }
  return g;
}

function deepLinkPath(n) {
  const link = n.deepLink;
  if (link) return link;
  const t = n.type;
  if (t === 'kyc_approved' || t === 'kyc_rejected' || t === 'kyc_clarification') return '/worker/kyc';
  if (t === 'shield_payout') return '/worker';
  if (t?.includes('order') || t === 'job_assigned') return n.data?.orderId ? `/worker/jobs/${n.data.orderId}` : '/worker';
  return '/worker';
}

/* ─── Single notification card ──────────────────────────────────────────── */
function NotifCard({ n, onRead, nav }) {
  const cfg = TYPE_CFG[n.type] ?? DEFAULT_CFG;
  const { Icon } = cfg;
  const unread = !n.readAt;

  function handleTap() {
    if (unread) onRead(n._id);
    nav(deepLinkPath(n));
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onClick={handleTap}
      className={`flex items-start gap-3 p-4 rounded-2xl cursor-pointer transition-all active:scale-[0.98] ${
        unread ? `${cfg.bg} ring-1 ${cfg.ring}` : 'bg-white ring-1 ring-slate-100'
      }`}
    >
      {/* icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${unread ? cfg.bg : 'bg-slate-100'} ring-1 ${cfg.ring}`}>
        <Icon size={17} className={unread ? cfg.color : 'text-slate-400'} />
      </div>

      {/* content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-bold leading-tight ${unread ? 'text-slate-900' : 'text-slate-600'}`}>{n.title}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            {unread && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">{timeAgo(n.createdAt)}</span>
          </div>
        </div>
        {n.body && (
          <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{n.body}</p>
        )}
        <div className="flex items-center gap-1 mt-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
      </div>

      <ChevronRight size={14} className="text-slate-300 shrink-0 mt-1" />
    </motion.div>
  );
}

function DaySection({ label, items, onRead, nav }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2">{label}</p>
      <div className="space-y-2">
        <AnimatePresence>
          {items.map((n) => (
            <NotifCard key={n._id} n={n} onRead={onRead} nav={nav} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Empty state ───────────────────────────────────────────────────────── */
function EmptyState({ tab }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
        <Bell size={28} className="text-slate-300" />
      </div>
      <div>
        <p className="font-semibold text-slate-700">
          {tab === 'all' ? 'No notifications yet' : `No ${tab} notifications`}
        </p>
        <p className="text-sm text-slate-400 mt-1">
          {tab === 'kyc' ? "KYC updates from admin will appear here"
           : tab === 'earnings' ? "Earnings, payouts and penalties will appear here"
           : tab === 'jobs' ? "Job events will appear here"
           : "You're all caught up!"}
        </p>
      </div>
    </div>
  );
}

/* ─── Root ──────────────────────────────────────────────────────────────── */
export default function WorkerNotificationsPage() {
  const nav  = useNavigate();
  const { accessToken: token } = useSelector(selectAuth);
  const [tab, setTab]          = useState('all');
  const [page]                 = useState(1);
  const [localItems, setLocalItems] = useState(null); // real-time injected notifs

  const { data, refetch } = useListNotificationsQuery({ page, unreadOnly: false }, {
    refetchOnMountOrArgChange: true,
    pollingInterval: 30000,
  });

  const [markRead]    = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();

  // Merge server data with any real-time pushed items
  const serverItems = data?.items ?? [];
  const items       = localItems ?? serverItems;

  // Socket listener — real-time push
  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const onNotif = (notif) => {
      setLocalItems((prev) => {
        const base = prev ?? serverItems;
        // Avoid duplicates
        if (base.find((n) => n._id === notif._id)) return base;
        return [notif, ...base];
      });
      toast(notif.title, { icon: TYPE_CFG[notif.type]?.emoji ?? '🔔', duration: 4000 });
    };
    socket.on('notification', onNotif);
    return () => socket.off('notification', onNotif);
  }, [token, serverItems]);

  async function handleMarkRead(id) {
    try {
      await markRead(id).unwrap();
      setLocalItems((prev) =>
        (prev ?? serverItems).map((n) => n._id === id ? { ...n, readAt: new Date().toISOString() } : n)
      );
    } catch { /* best effort */ }
  }

  async function handleMarkAll() {
    try {
      await markAllRead().unwrap();
      setLocalItems((prev) =>
        (prev ?? serverItems).map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
      );
      toast.success('All marked as read');
      refetch();
    } catch (err) { toast.error('Failed'); }
  }

  // Filter by tab
  const filtered = tab === 'all'
    ? items
    : items.filter((n) => TAB_TYPES[tab]?.includes(n.type));

  const groups  = groupByDay(filtered);
  const isEmpty = !filtered.length;
  const unread  = data?.unread ?? items.filter((n) => !n.readAt).length;

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 safe-top">
        <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/worker')} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200 transition">
              <ArrowLeft size={17} strokeWidth={2.5} />
            </button>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">Notifications</h1>
              {unread > 0 && (
                <p className="text-[11px] text-indigo-600 font-semibold">{unread} unread</p>
              )}
            </div>
          </div>
          {unread > 0 && (
            <button
              onClick={handleMarkAll}
              disabled={markingAll}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition px-3 py-1.5 rounded-xl hover:bg-indigo-50"
            >
              <CheckCheck size={13} />
              Mark all read
            </button>
          )}
        </div>

        {/* tab bar */}
        <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pb-3 flex gap-1">
          {TABS.map((t) => {
            const tabUnread = t.id === 'all'
              ? unread
              : items.filter((n) => !n.readAt && TAB_TYPES[t.id]?.includes(n.type)).length;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  tab === t.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {t.label}
                {tabUnread > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white text-indigo-600' : 'bg-red-500 text-white'}`}>
                    {tabUnread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* body */}
      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 py-4 space-y-5 pb-24">
        {isEmpty ? (
          <EmptyState tab={tab} />
        ) : (
          <>
            <DaySection label="Today"     items={groups.today}     onRead={handleMarkRead} nav={nav} />
            <DaySection label="Yesterday" items={groups.yesterday} onRead={handleMarkRead} nav={nav} />
            <DaySection label="Earlier"   items={groups.earlier}   onRead={handleMarkRead} nav={nav} />
          </>
        )}
      </div>
    </div>
  );
}
