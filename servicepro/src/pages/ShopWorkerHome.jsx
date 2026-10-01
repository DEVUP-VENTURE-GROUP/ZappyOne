import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  Store, Phone, Power, Loader2, ChevronRight, Wrench, ClipboardList, ShieldCheck, Bell, UserRound, LogOut, Info,
} from 'lucide-react';
import {
  useGetWorkerMeQuery, useGetMyShopQuery, useGetKycStatusQuery, useGoOnlineMutation, useGoOfflineMutation,
  useRepairProviderJobsQuery, useGetWorkerOrdersQuery, useLogoutMutation,
} from '@shared/services/api';
import { selectAuth, logout } from '@shared/modules/auth/authSlice';
import { useGeolocation } from '@shared/hooks/useGeolocation';
import { formatPaise } from '@shared/utils/money';
import OrderOfferHost from '@shared/provider/OrderOfferHost';
import { useLocationBroadcast } from '@shared/provider/useLocationBroadcast';

const ORDER_OPEN = ['assigned', 'on_the_way', 'arrived', 'in_progress'];
const label = (s = '') => s.replace(/_/g, ' ').toLowerCase();

/**
 * A shop technician's home. The shop assigns the work and pays its staff, so
 * there is no wallet, payout or service sign-up here — just duty, today's jobs
 * and the shop they work for. Job value is what customers paid the shop.
 */
export default function ShopWorkerHome() {
  const nav = useNavigate();
  const dispatch = useDispatch();
  const { accessToken } = useSelector(selectAuth);
  const { data: meData, refetch: refetchMe } = useGetWorkerMeQuery(undefined, { pollingInterval: 60000 });
  const { data: shopData } = useGetMyShopQuery(undefined, { pollingInterval: 120000 });
  const { data: kycData } = useGetKycStatusQuery();
  const { data: repairData, isLoading: loadingRepair } = useRepairProviderJobsQuery({ active: 'true' }, { pollingInterval: 30000 });
  const { data: ordersData, isLoading: loadingOrders } = useGetWorkerOrdersQuery(1, { pollingInterval: 30000 });
  const [goOnline] = useGoOnlineMutation();
  const [goOffline] = useGoOfflineMutation();
  const [callLogout] = useLogoutMutation();
  const { getCurrent } = useGeolocation();
  const [toggling, setToggling] = useState(false);

  const me = meData?.worker;
  const onDuty = !!me?.isOnline;
  const kycApproved = kycData?.kyc?.status === 'approved';
  useLocationBroadcast({ isOnline: onDuty, token: accessToken, currentOrderId: me?.currentOrderId });

  const jobs = [
    ...(repairData?.bookings || []).map((b) => ({
      id: b._id, to: `/worker/repair/${b._id}`, title: `${b.brandCode || ''} ${b.modelCode || ''}`.trim() || 'Repair job',
      sub: `${b.repairCode ? label(b.repairCode) : 'inspection'} · ${b.reference}`, status: b.status,
      valuePaise: b.priceSnapshot?.totalPaise,
    })),
    ...(ordersData?.orders || []).filter((o) => ORDER_OPEN.includes(o.status)).map((o) => ({
      id: o._id, to: `/worker/jobs/${o._id}`, title: label(o.service), sub: o.pickupLocation?.address || '',
      status: o.status, valuePaise: o.pricing?.totalPaise,
    })),
  ];

  async function toggleDuty() {
    if (!kycApproved) { toast.error('Finish your ID verification first'); nav('/worker/kyc'); return; }
    if (onDuty && me?.currentOrderId) { toast('Finish your active job first'); return; }
    setToggling(true);
    try {
      if (onDuty) {
        await goOffline().unwrap();
        toast.success('You are off duty');
      } else {
        const pos = await getCurrent();
        await goOnline({ lat: pos.lat, lng: pos.lng }).unwrap();
        toast.success('You are on duty');
      }
      refetchMe();
    } catch (err) {
      toast.error(err?.data?.error || err?.message || 'Could not change duty');
    } finally {
      setToggling(false);
    }
  }

  async function signOut() {
    try { await callLogout().unwrap(); } catch { /* signing out locally regardless */ }
    dispatch(logout());
    nav('/shop/worker/login', { replace: true });
  }

  const shop = shopData?.shop;
  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="bg-white border-b border-slate-100">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zappy-50">
            <Store size={20} className="text-zappy-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black text-navy">{me?.name || 'Technician'}</p>
            <p className="truncate text-xs text-slate-500">{shop ? `Working for ${shop.name}` : 'Loading your shop…'}</p>
          </div>
          {shop?.phone && (
            <a href={`tel:${shop.phone}`} className="flex h-10 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700" aria-label="Call shop owner">
              <Phone size={14} /> Owner
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <button
          onClick={toggleDuty}
          disabled={toggling}
          className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left ring-1 transition ${onDuty ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-slate-200'}`}
        >
          <span className={`flex h-11 w-11 items-center justify-center rounded-full ${onDuty ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
            {toggling ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
          </span>
          <span className="flex-1">
            <span className="block text-sm font-black text-navy">{onDuty ? 'On duty' : 'Off duty'}</span>
            <span className="block text-xs text-slate-500">
              {onDuty ? 'Your shop can give you jobs. Tap to go off duty.' : 'Tap to start receiving jobs from your shop.'}
            </span>
          </span>
        </button>
        {!kycApproved && (
          <button onClick={() => nav('/worker/kyc')} className="flex w-full items-center gap-2 rounded-2xl bg-amber-50 p-3 text-left text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            <ShieldCheck size={15} /> Verify your ID before you can go on duty <ChevronRight size={14} className="ml-auto" />
          </button>
        )}

        <section className="grid grid-cols-2 gap-3">
          {[['Today', shopData?.today], ['This week', shopData?.week]].map(([title, t]) => (
            <div key={title} className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{title}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-navy">{t?.jobs ?? '–'}</p>
              <p className="text-xs text-slate-500">jobs done · <span className="tabular-nums">{t ? formatPaise(t.valuePaise) : '–'}</span></p>
            </div>
          ))}
        </section>
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
          <Info size={12} className="mt-0.5 shrink-0" /> Job value is what customers paid your shop, not your pay. Your shop pays you directly.
        </p>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <p className="flex items-center gap-2 text-sm font-black text-navy"><ClipboardList size={15} className="text-zappy-600" /> My jobs</p>
          {loadingRepair || loadingOrders ? (
            <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
          ) : jobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No jobs right now. Your shop owner will assign the next one.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button onClick={() => nav(j.to)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left ring-1 ring-slate-100 transition hover:ring-zappy-200">
                    <Wrench size={15} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold capitalize text-navy">{j.title}</span>
                      <span className="block truncate text-[11px] text-slate-400">{j.sub}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {j.valuePaise > 0 && <span className="block text-xs font-bold tabular-nums text-slate-700">{formatPaise(j.valuePaise)}</span>}
                      <span className="block text-[10px] font-semibold capitalize text-slate-400">{label(j.status)}</span>
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-slate-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav className="grid grid-cols-3 gap-2">
          {[
            { to: '/worker/profile', label: 'Profile', Icon: UserRound },
            { to: '/worker/kyc', label: 'ID check', Icon: ShieldCheck },
            { to: '/worker/notifications', label: 'Alerts', Icon: Bell },
          ].map(({ to, label: text, Icon }) => (
            <button key={to} onClick={() => nav(to)} className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-100">
              <Icon size={16} className="text-slate-500" /> {text}
            </button>
          ))}
        </nav>
        <button onClick={signOut} className="mx-auto flex items-center gap-1.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600">
          <LogOut size={13} /> Sign out
        </button>
      </main>

      <OrderOfferHost onJobChanged={refetchMe} />
    </div>
  );
}
