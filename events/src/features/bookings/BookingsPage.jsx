import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, ChevronRight, Users } from 'lucide-react';
import { usePartnerBookingsQuery } from '@shared/services/api';
import { PageHeader, Spinner, Empty } from '../../components/ui';
import { FILTERS, StatusChip } from './status';
import { rupees, shortDate } from '../../lib/format';
import { placeName } from '@shared/constants/telanganaPlaces';

/** Every booking, filtered by what the partner needs to do with it. */
export default function BookingsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'confirmed';
  const page = Number(params.get('page') || 1);
  const { data, isLoading, isFetching } = usePartnerBookingsQuery({ status: status || undefined, page });
  const rows = data?.bookings || [];

  const set = (next) => setParams((p) => { const n = new URLSearchParams(p); Object.entries(next).forEach(([k, v]) => (v === '' || v == null ? n.delete(k) : n.set(k, v))); return n; });

  return (
    <div>
      <PageHeader title="Bookings" subtitle="Accept new requests, then set up on the day." />

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key || 'all'} type="button" role="tab" aria-selected={status === f.key}
            onClick={() => set({ status: f.key === 'confirmed' ? null : f.key, page: null })}
            className={`min-h-[36px] shrink-0 rounded-btn border px-3.5 text-[13px] font-semibold ${status === f.key ? 'border-zappy-600 bg-zappy-600 text-white' : 'border-line bg-white text-ink-700'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? <Spinner /> : !rows.length ? (
        <Empty icon={CalendarCheck} title="No bookings here"
          text={status === 'confirmed' ? 'New requests appear here as soon as a customer books one of your packages.' : 'Nothing in this list yet.'} />
      ) : (
        <ul className={`space-y-2.5 ${isFetching ? 'opacity-60' : ''}`}>
          {rows.map((b) => {
            const pct = b.pricing?.platformCommissionPct ?? 10;
            const net = Math.round((b.pricing?.totalPaise || 0) * (100 - pct) / 100);
            return (
              <li key={b._id}>
                <Link to={`/partner/bookings/${b._id}`} className="flex items-center gap-3 rounded-card border border-line bg-white p-3.5 hover:border-line-strong">
                  <span className="flex w-14 shrink-0 flex-col items-center rounded-btn bg-sunken py-2">
                    <span className="text-[11px] font-semibold uppercase text-ink-500">{new Date(b.eventDate).toLocaleDateString('en-IN', { month: 'short' })}</span>
                    <span className="text-[20px] font-bold leading-none text-ink-900">{new Date(b.eventDate).getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-ink-900">{b.themeId?.title || 'Event'}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-500">
                      {shortDate(b.eventDate)} · {b.eventTimeSlot} · {placeName(b.address?.city) || 'Location on booking'}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
                      <StatusChip status={b.status} />
                      <span className="flex items-center gap-1"><Users size={12} /> {b.guestCount || 1}</span>
                      <span className="font-semibold text-ink-900">You get {rupees(net)}</span>
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-ink-300" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {data?.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <button type="button" disabled={page <= 1} onClick={() => set({ page: page - 1 })} className="btn-outline min-h-[40px] px-3 disabled:opacity-40">Previous</button>
          <span className="text-ink-500">Page {page} of {data.pages}</span>
          <button type="button" disabled={page >= data.pages} onClick={() => set({ page: page + 1 })} className="btn-outline min-h-[40px] px-3 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
