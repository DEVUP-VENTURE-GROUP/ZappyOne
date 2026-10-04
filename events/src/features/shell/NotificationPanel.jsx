import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, X, PartyPopper, BadgeCheck, XCircle, AlertTriangle, Trophy, Wallet, Megaphone } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  usePartnerNotificationsQuery, useMarkPartnerNotificationReadMutation, useMarkAllPartnerNotificationsReadMutation,
} from '@shared/services/api';
import { timeAgo } from '../../lib/format';

const META = {
  event_booking_new: { Icon: PartyPopper, tone: 'bg-zappy-50 text-zappy-700' },
  event_partner_kyc_approved: { Icon: BadgeCheck, tone: 'bg-green-50 text-green-700' },
  event_partner_kyc_rejected: { Icon: XCircle, tone: 'bg-red-50 text-red-700' },
  event_booking_cancelled: { Icon: AlertTriangle, tone: 'bg-amber-50 text-amber-800' },
  event_completed: { Icon: Trophy, tone: 'bg-green-50 text-green-700' },
  wallet_credited: { Icon: Wallet, tone: 'bg-green-50 text-green-700' },
  promotional: { Icon: Megaphone, tone: 'bg-sunken text-ink-700' },
};
const metaOf = (type) => META[type] || { Icon: Bell, tone: 'bg-sunken text-ink-700' };

/** Booking, verification and money updates, newest first. */
export default function NotificationPanel({ onClose }) {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading } = usePartnerNotificationsQuery({ page, unreadOnly });
  const [markRead] = useMarkPartnerNotificationReadMutation();
  const [markAllRead] = useMarkAllPartnerNotificationsReadMutation();
  const items = data?.items || [];
  const unread = data?.unread || 0;

  async function readAll() {
    await markAllRead().unwrap().catch(() => {});
    toast.success('All marked as read');
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end bg-ink-900/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="flex h-full w-full max-w-sm flex-col bg-white shadow-float" aria-label="Notifications">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-[16px] font-bold text-ink-900">Notifications</p>
            {unread > 0 && <p className="text-[12px] text-zappy-600">{unread} unread</p>}
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 && <button type="button" onClick={readAll} className="rounded-btn px-2.5 py-1.5 text-[13px] font-semibold text-zappy-600 hover:bg-zappy-50">Mark all read</button>}
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-btn hover:bg-sunken"><X size={17} /></button>
          </div>
        </header>

        <div className="flex gap-2 border-b border-line px-5 py-3">
          {[false, true].map((v) => (
            <button key={String(v)} type="button" onClick={() => { setUnreadOnly(v); setPage(1); }}
              className={`chip ${unreadOnly === v ? 'bg-zappy-600 text-white' : 'bg-sunken text-ink-700'}`}>{v ? 'Unread' : 'All'}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? <p className="py-16 text-center text-[14px] text-ink-500">Loading…</p>
            : !items.length ? (
              <div className="px-6 py-16 text-center">
                <p className="text-[15px] font-semibold text-ink-900">Nothing here yet</p>
                <p className="mt-1 text-[13px] text-ink-500">New bookings, verification and payment updates show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => {
                  const { Icon, tone } = metaOf(n.type);
                  const isUnread = !n.readAt;
                  return (
                    <li key={n._id}>
                      <button type="button" onClick={() => isUnread && markRead(n._id)}
                        className={`flex w-full gap-3 px-5 py-4 text-left hover:bg-canvas ${isUnread ? 'bg-zappy-50/50' : ''}`}>
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-btn ${tone}`}><Icon size={17} /></span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[14px] leading-snug ${isUnread ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>{n.title}</span>
                          {n.body && <span className="mt-0.5 block text-[13px] text-ink-500 line-clamp-2">{n.body}</span>}
                          <span className="mt-1 block text-[12px] text-ink-400">{timeAgo(n.createdAt)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
        </div>

        {data?.pages > 1 && (
          <footer className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px]">
            <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-outline min-h-[36px] px-3 disabled:opacity-40">Previous</button>
            <span className="text-ink-500">{page} / {data.pages}</span>
            <button type="button" disabled={page === data.pages} onClick={() => setPage((p) => p + 1)} className="btn-outline min-h-[36px] px-3 disabled:opacity-40">Next</button>
          </footer>
        )}
      </motion.aside>
    </motion.div>
  );
}
