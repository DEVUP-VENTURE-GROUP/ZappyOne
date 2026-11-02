import { Link, useOutletContext } from 'react-router-dom';
import { ShieldCheck, ArrowRight, CalendarCheck, Images, Star } from 'lucide-react';
import { usePartnerOverviewQuery, usePartnerBookingsQuery } from '@shared/services/api';
import { Spinner, Stat, Card } from '../../components/ui';
import { StatusChip } from '../bookings/status';
import { rupees, shortDate } from '../../lib/format';
import { placeName } from '@shared/constants/telanganaPlaces';

/**
 * What needs the partner today: requests waiting for an answer, what is coming
 * up, and what they have earned. Every number comes from the server.
 */
export default function OverviewPage() {
  const { partner, verified } = useOutletContext();
  const { data, isLoading } = usePartnerOverviewQuery();
  const { data: newOnes } = usePartnerBookingsQuery({ status: 'confirmed' }, { skip: !verified });
  const { data: upcoming } = usePartnerBookingsQuery({ status: 'upcoming' }, { skip: !verified });

  if (isLoading) return <Spinner kind="dashboard" />;
  const s = data?.stats || {};
  const rating = partner?.reviewCount ? Number(partner.rating).toFixed(1) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-ink-900">Hello, {partner?.ownerName?.split(' ')[0] || partner?.businessName || 'partner'}</h1>
        <p className="mt-0.5 text-[14px] text-ink-500">{partner?.businessName}</p>
      </div>

      {!verified && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-amber-50 text-amber-700"><ShieldCheck size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink-900">
              {partner?.kyc?.status === 'pending' ? 'Your documents are being reviewed' : 'Verify your business to start taking bookings'}
            </p>
            <p className="text-[13px] text-ink-500">
              {partner?.kyc?.status === 'pending'
                ? 'We usually respond within 24 hours. You can finish your profile meanwhile.'
                : 'Upload your ID and a live selfie. Packages, bookings and earnings open once you are verified.'}
            </p>
          </div>
          <Link to="/partner/profile" className="btn-primary">{partner?.kyc?.status === 'pending' ? 'View status' : 'Verify now'}</Link>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="New requests" value={s.pendingConfirmations ?? 0} hint="Waiting for your answer" />
        <Stat label="Next 7 days" value={s.upcomingEvents ?? 0} hint="Events to set up" />
        <Stat label="Live packages" value={s.themes ?? 0} />
        <Stat label="Earned so far" value={rupees(s.netEarningsPaise)} hint="After ZappyOne's commission" />
      </div>

      {verified && (
        <div className="grid gap-4 lg:grid-cols-2">
          <BookingList title="New requests" empty="No new requests right now." rows={newOnes?.bookings} to="/partner/bookings?status=confirmed" />
          <BookingList title="Coming up" empty="Nothing accepted yet." rows={upcoming?.bookings} to="/partner/bookings?status=upcoming" />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Shortcut to="/partner/packages/new" Icon={Images} title="Add a package" text="Photos, price and what is included" locked={!verified} />
        <Shortcut to="/partner/calendar" Icon={CalendarCheck} title="Block dates" text="Days you are not available" locked={!verified} />
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-amber-50 text-amber-700"><Star size={18} /></span>
          <span>
            <span className="block text-[15px] font-semibold text-ink-900">{rating ? `${rating} rating` : 'No ratings yet'}</span>
            <span className="block text-[13px] text-ink-500">{partner?.completedEvents || 0} events completed</span>
          </span>
        </Card>
      </div>
    </div>
  );
}

function BookingList({ title, empty, rows = [], to }) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-[15px] font-bold text-ink-900">{title}</p>
        <Link to={to} className="flex items-center gap-1 text-[13px] font-semibold text-zappy-600">See all <ArrowRight size={14} /></Link>
      </div>
      {!rows?.length ? <p className="px-4 py-6 text-[14px] text-ink-500">{empty}</p> : (
        <ul className="divide-y divide-line">
          {rows.slice(0, 4).map((b) => (
            <li key={b._id}>
              <Link to={`/partner/bookings/${b._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink-900">{b.themeId?.title || 'Event'}</span>
                  <span className="block text-[13px] text-ink-500">{shortDate(b.eventDate)}, {b.eventTimeSlot}, {placeName(b.address?.city) || '-'}</span>
                </span>
                <StatusChip status={b.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Shortcut({ to, Icon, title, text, locked }) {
  const body = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-zappy-50 text-zappy-700"><Icon size={18} /></span>
      <span>
        <span className="block text-[15px] font-semibold text-ink-900">{title}</span>
        <span className="block text-[13px] text-ink-500">{locked ? 'After verification' : text}</span>
      </span>
    </>
  );
  return locked
    ? <div className="flex items-center gap-3 rounded-card border border-line bg-white p-4 opacity-60">{body}</div>
    : <Link to={to} className="flex items-center gap-3 rounded-card border border-line bg-white p-4 hover:border-line-strong">{body}</Link>;
}
