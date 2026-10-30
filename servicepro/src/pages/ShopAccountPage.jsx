import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Store, Landmark, Bell, Wallet, ShieldCheck, ChevronRight, Phone, Mail } from 'lucide-react';
import { useShopMeQuery, useUpdateShopMeMutation } from '@shared/services/api';

/**
 * Profile — the owner's own account: their name, how ZappyOne reaches them,
 * and the shortcuts to everything about the shop's money and settings.
 * (The shop itself — name, photos, address, hours — is "Shop & hours".)
 */
export default function ShopAccountPage() {
  const nav = useNavigate();
  const { data, isLoading } = useShopMeQuery();
  const [save, { isLoading: saving }] = useUpdateShopMeMutation();
  const shop = data?.shop;
  const [ownerName, setOwnerName] = useState('');
  useEffect(() => { if (shop) setOwnerName(shop.ownerName || ''); }, [shop]);

  if (isLoading || !shop) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin text-zappy-500" /></div>;

  async function submit() {
    try { await save({ ownerName: ownerName.trim() }).unwrap(); toast.success('Saved'); } catch (err) { toast.error(err?.data?.error || 'Could not save'); }
  }

  const links = [
    ['Shop & hours', 'Name, photos, address and opening hours', Store, '/shop/profile'],
    ['Bank & UPI', 'Where your payouts go', Landmark, '/shop/bank'],
    ['Withdraw', 'What ZappyOne owes you, and asking for it', Wallet, '/shop/withdraw'],
    ['Notifications', 'Everything we have told you', Bell, '/shop/notifications'],
    ['Verification', 'Your documents and services', ShieldCheck, '/shop/kyc'],
  ];

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16">
      <header className="page-header"><div className="page-header-inner">
        <button type="button" onClick={() => nav('/shop')} className="back-btn" aria-label="Back"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card">Profile</h1>
      </div></header>

      <div className="mx-auto max-w-lg space-y-4 px-4 pt-4 lg:max-w-2xl">
        <section className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zappy-600 text-xl font-black text-white">
            {(shop.ownerName || shop.businessName || 'S').trim()[0].toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold text-slate-900">{shop.ownerName || 'Owner'}</p>
            <p className="truncate text-[13px] text-slate-500">{shop.businessName}</p>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-600">Your name (as on your ID)</span>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={100}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zappy-100" />
          </label>
          <p className="flex items-center gap-2 text-[13px] text-slate-600"><Phone size={14} className="text-slate-400" /> {shop.phone} <span className="text-[11px] text-slate-400">(sign-in number)</span></p>
          <p className="flex items-center gap-2 text-[13px] text-slate-600"><Mail size={14} className="text-slate-400" /> {shop.email || 'No email yet'}</p>
          <button type="button" onClick={submit} disabled={saving || ownerName.trim().length < 2 || ownerName.trim() === (shop.ownerName || '')}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] text-sm font-bold text-white disabled:opacity-40">
            {saving && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </section>

        <section className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-100">
          {links.map(([title, hint, Icon, to]) => (
            <button key={to} type="button" onClick={() => nav(to)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50">
              <Icon size={18} className="shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{title}</span>
                <span className="block text-[12px] text-slate-500">{hint}</span>
              </span>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
