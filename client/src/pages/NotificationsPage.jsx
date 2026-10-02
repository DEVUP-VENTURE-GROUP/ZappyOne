import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Package,
  CreditCard,
  Zap,
  MapPin,
  Star,
  Gift,
  ShieldCheck,
  AlertTriangle,
  Wallet,
  Trophy,
  Clock,
  ChevronRight,
  Settings,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Rocket,
  Tag,
} from 'lucide-react';
import {
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} from '@shared/services/api';
import { ErrorState } from '../components/common/QueryState';
import PageTransition from '../components/common/PageTransition';
import toast from 'react-hot-toast';

/* Type → visual config */
const TYPE_CONFIG = {
  order_placed:         { icon: Package,      label: 'New Order',      color: 'text-[#0066FF]' },
  worker_assigned:      { icon: Zap,          label: 'Worker Found',   color: 'text-[#0066FF]' },
  worker_on_the_way:    { icon: Rocket,       label: 'On the Way',     color: 'text-[#0066FF]' },
  worker_arriving_soon: { icon: MapPin,       label: 'Almost Here',    color: 'text-[#0066FF]' },
  worker_arrived:       { icon: CheckCheck,   label: 'Worker Arrived', color: 'text-[#0066FF]' },
  order_completed:      { icon: CheckCircle2, label: 'Completed',      color: 'text-[#0066FF]' },
  order_cancelled:      { icon: XCircle,      label: 'Cancelled',      color: 'text-slate-500' },
  order_failed:         { icon: AlertTriangle,label: 'Failed',         color: 'text-slate-500' },
  rating_request:       { icon: Star,         label: 'Rate Service',   color: 'text-[#0066FF]' },
  wallet_credited:      { icon: Wallet,       label: 'Money In',       color: 'text-[#0066FF]' },
  cashback_received:    { icon: Gift,         label: 'Cashback',       color: 'text-[#0066FF]' },
  referral_reward:      { icon: Trophy,       label: 'Referral Bonus', color: 'text-[#0066FF]' },
  kyc_approved:         { icon: ShieldCheck,  label: 'KYC Approved',   color: 'text-[#0066FF]' },
  kyc_rejected:         { icon: AlertCircle,  label: 'KYC Issue',      color: 'text-slate-500' },
  late_arrival_penalty: { icon: Clock,        label: 'Penalty',        color: 'text-slate-500' },
  trip_started:         { icon: Rocket,       label: 'Trip Started',   color: 'text-[#0066FF]' },
  refund_processed:     { icon: CreditCard,   label: 'Refund',         color: 'text-[#0066FF]' },
  promotional:          { icon: Tag,     label: 'Offer',          color: 'text-[#0066FF]' },
  system_alert:         { icon: Bell,         label: 'Alert',          color: 'text-slate-500' },
};
const DEFAULT_CFG = { icon: Bell, label: 'Notification', color: 'text-[#0066FF]' };

/* Time helpers */
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return Math.floor(h / 24) === 1 ? 'Yesterday' : `${Math.floor(h / 24)}d ago`;
}

function groupByDay(items) {
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const groups    = { today: [], yesterday: [], earlier: [] };
  for (const n of items) {
    const d = new Date(n.createdAt); d.setHours(0, 0, 0, 0);
    if (d >= today)          groups.today.push(n);
    else if (d >= yesterday) groups.yesterday.push(n);
    else                     groups.earlier.push(n);
  }
  return groups;
}

/* Animated empty state */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center pt-24 pb-12 gap-5 text-center px-6">
      <div className="w-16 h-16 rounded-card bg-slate-50 border border-slate-100 flex items-center justify-center">
        <Bell size={28} strokeWidth={1.5} className="text-slate-400" />
      </div>
      <div className="max-w-sm">
        <p className="text-[18px] font-semibold text-slate-900 mb-2">
          You're all caught up.
        </p>
        <p className="text-[14px] text-slate-500 leading-relaxed">
          New notifications will appear here when there are booking updates, payments, offers, or account activity.
        </p>
      </div>
    </div>
  );
}

/* Single notification card */
function NotifCard({ n, onTap }) {
  const cfg = TYPE_CONFIG[n.type] || DEFAULT_CFG;
  const unread = !n.readAt;
  const Icon = cfg.icon;

  return (
    <div
      onClick={() => onTap(n)}
      className={`group relative flex items-start gap-4 p-5 rounded-card transition-all duration-200 cursor-pointer 
      ${unread 
        ? 'bg-[#0066FF]/5 border border-[#0066FF]/20 shadow-[0_2px_12px_rgba(0,0,0,0.02)]' 
        : 'bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:bg-slate-50/50'} 
      hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] hover:-translate-y-[1px]`}
    >
      {unread && (
        <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-[#0066FF]" />
      )}
      
      <div className={`mt-0.5 shrink-0 ${unread ? cfg.color : 'text-slate-400 group-hover:text-slate-500'}`}>
        <Icon size={20} strokeWidth={unread ? 2.5 : 2} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-3">
          <p className={`text-[15px] leading-snug mb-1 ${unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
            {n.title}
          </p>
          <span className={`text-[12px] whitespace-nowrap shrink-0 ${unread ? 'font-medium text-[#0066FF]' : 'text-slate-400'}`}>
            {timeAgo(n.createdAt)}
          </span>
        </div>
        
        {n.body && (
          <p className={`text-[14px] leading-relaxed ${unread ? 'text-slate-600' : 'text-slate-500'}`}>
            {n.body}
          </p>
        )}
      </div>

      {n.deepLink && (
        <div className="shrink-0 flex items-center self-center pl-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronRight size={18} className="text-slate-300" />
        </div>
      )}
    </div>
  );
}

/* Section header */
function SectionLabel({ label }) {
  return (
    <h3 className="px-1 pt-8 pb-4 text-[13px] font-semibold text-slate-400 uppercase tracking-widest">
      {label}
    </h3>
  );
}

/* Main page */
export default function NotificationsPage() {
  const nav = useNavigate();
  
  const { data, isLoading, isFetching, isError, refetch } = useListNotificationsQuery({ page: 1, unreadOnly: false });
  const [markRead]   = useMarkNotificationReadMutation();
  const [markAllMut] = useMarkAllNotificationsReadMutation();

  const notifications = data?.items || [];
  const unreadCount   = data?.unread ?? 0;

  async function handleMarkAll() {
    try { await markAllMut().unwrap(); toast.success('All marked as read'); }
    catch { toast.error('Failed to mark all as read'); }
  }

  async function handleTap(n) {
    if (!n.readAt) await markRead(n._id).unwrap().catch(() => {});
    if (n.deepLink) nav(n.deepLink);
  }

  const groups = useMemo(() => groupByDay(notifications), [notifications]);
  const hasAny = notifications.length > 0;

  return (
    <PageTransition>
      <div className="min-h-screen bg-white">
        
        {/* Header Area */}
        <header className="w-full max-w-[960px] mx-auto px-5 md:px-8 pt-10 pb-6 md:pt-14 md:pb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-b border-slate-100">
          <div className="flex-1">
            <button
              onClick={() => nav(-1)}
              className="mb-6 w-10 h-10 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-[28px] md:text-[32px] font-bold text-slate-900 tracking-tight leading-tight mb-2">
              Notifications
            </h1>
            <p className="text-[14px] md:text-[15px] text-slate-500 max-w-lg leading-relaxed">
              Stay updated with your bookings, payments, account activity, and service updates.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {hasAny && unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-[13px] font-medium text-slate-600 hover:text-[#0066FF] bg-white border border-slate-200 hover:border-blue-200 px-4 py-2.5 rounded-full transition-colors flex items-center gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
              >
                <CheckCheck size={16} />
                Mark all as read
              </button>
            )}
            <Link 
              to="/notification-prefs" 
              className="w-[42px] h-[42px] flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
            >
              <Settings size={18} />
            </Link>
          </div>
        </header>

        {/* Content Area */}
        <main className="w-full max-w-[960px] mx-auto px-5 md:px-8 py-4 pb-24">
          
          {isFetching && (
            <div className="fixed top-0 left-0 right-0 h-1 z-50">
              <div className="h-full bg-blue-500/20 w-full overflow-hidden">
                <div className="h-full bg-[#0066FF] w-1/3 animate-[slide_1.5s_ease-in-out_infinite]" />
              </div>
            </div>
          )}

          {isError ? (
            <ErrorState onRetry={refetch} />
          ) : isLoading ? (
            <div className="pt-6 space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-start gap-4 p-5 bg-white border border-slate-100 rounded-card">
                  <div className="w-5 h-5 rounded-md bg-slate-100 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-3 pt-1">
                    <div className="flex justify-between items-center">
                      <div className="h-4 bg-slate-100 rounded-full w-1/3 animate-pulse" />
                      <div className="h-3 bg-slate-50 rounded-full w-12 animate-pulse" />
                    </div>
                    <div className="h-3.5 bg-slate-50 rounded-full w-3/4 animate-pulse" />
                    <div className="h-3.5 bg-slate-50 rounded-full w-1/2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasAny ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-2">
              {groups.today.length > 0 && (
                <div className="mb-4">
                  <SectionLabel label="Today" />
                  <div className="flex flex-col gap-3">
                    {groups.today.map((n) => (
                      <NotifCard key={n._id} n={n} onTap={handleTap} />
                    ))}
                  </div>
                </div>
              )}

              {groups.yesterday.length > 0 && (
                <div className="mb-4">
                  <SectionLabel label="Yesterday" />
                  <div className="flex flex-col gap-3">
                    {groups.yesterday.map((n) => (
                      <NotifCard key={n._id} n={n} onTap={handleTap} />
                    ))}
                  </div>
                </div>
              )}

              {groups.earlier.length > 0 && (
                <div className="mb-4">
                  <SectionLabel label="Earlier" />
                  <div className="flex flex-col gap-3">
                    {groups.earlier.map((n) => (
                      <NotifCard key={n._id} n={n} onTap={handleTap} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
