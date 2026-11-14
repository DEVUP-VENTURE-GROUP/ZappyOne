import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Loader2, Trash2, Pencil, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useShopPlansQuery, useSaveShopPlanMutation, useDeleteShopPlanMutation } from '@shared/services/api';
import { useT } from '@shared/i18n/I18nProvider';

const EMPTY = { kind: 'monthly', title: '', services: [], price: '', perk: '' };
const KINDS = [{ key: 'monthly', label: 'Monthly plan', tk: 'sp.monthlyPlan' }, { key: 'one_day', label: 'One-day pack', tk: 'sp.oneDayPack' }];

/** What publishing still needs — shown on screen, so the button never just sits there. */
function missingForPublish(f, t) {
  if (!f.title.trim()) return t('sp.pl.needName', 'Give the plan a name');
  if (!f.services.length) return t('sp.pl.needService', 'Pick at least one service');
  if (!(Number(f.price) >= 1)) return t('sp.pl.needPrice', 'Set a price of at least ₹1');
  return null;
}

export default function ShopPlansPage() {
  const nav = useNavigate();
  const t = useT();
  const { data, isLoading } = useShopPlansQuery();
  const [save, { isLoading: saving }] = useSaveShopPlanMutation();
  const [remove] = useDeleteShopPlanMutation();
  const [form, setForm] = useState(null); // null = list; else the plan being edited
  const [error, setError] = useState('');
  const services = data?.services || [];
  const nameOf = (code) => services.find((s) => s.code === code)?.name || code;
  const set = (k, v) => { setError(''); setForm((f) => ({ ...f, [k]: v })); };

  async function submit(status) {
    const missing = status === 'published' && missingForPublish(form, t);
    if (missing) return setError(missing);
    try {
      await save({
        _id: form._id, kind: form.kind, title: form.title.trim(), services: form.services,
        pricePaise: Math.round(Number(form.price || 0) * 100), perk: form.perk.trim(), status,
      }).unwrap();
      toast.success(status === 'published' ? t('sp.pl.published', 'Plan published') : t('sp.pl.drafted', 'Saved as draft'));
      setForm(null);
    } catch (err) {
      setError(err?.data?.error || t('sp.pl.saveFail', 'Could not save the plan. Try again.'));
    }
  }

  async function del(id) {
    if (!window.confirm(t('sp.pl.confirmDelete', 'Delete this plan?'))) return;
    try { await remove(id).unwrap(); toast.success(t('sp.pl.deleted', 'Plan deleted')); } catch { toast.error(t('sp.pl.deleteFail', 'Could not delete the plan')); }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-10">
      <header className="page-header"><div className="page-header-inner">
        <button onClick={() => (form ? setForm(null) : nav('/shop'))} className="back-btn"><ArrowLeft size={18} strokeWidth={2.5} /></button>
        <h1 className="h-card flex-1">{form ? (form._id ? t('sp.editPlan', 'Edit plan') : t('sp.newPlan', 'New plan')) : t('sp.plans', 'Plans')}</h1>
        {!form && (
          <button onClick={() => { setError(''); setForm(EMPTY); }} className="flex items-center gap-1 rounded-xl bg-zappy-600 px-3 py-2 text-sm font-bold text-white">
            <Plus size={16} /> {t('sp.newPlan', 'New plan')}
          </button>
        )}
      </div></header>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-400" /></div>
        ) : form ? (
          <div className="card space-y-4">
            <div className="flex gap-2">
              {KINDS.map((k) => (
                <button key={k.key} type="button" onClick={() => set('kind', k.key)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${form.kind === k.key ? 'bg-zappy-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                  {t(k.tk, k.label)}
                </button>
              ))}
            </div>
            <input className="input text-sm w-full" placeholder={t('sp.pl.nameEg', 'Plan name, e.g. Monthly care')} maxLength={80} value={form.title} onChange={(e) => set('title', e.target.value)} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">{t('sp.planServices', 'Services in this plan')}</p>
              {!services.length ? (
                <p className="text-sm text-slate-500">{t('sp.pl.noServices', 'Your shop has no services yet.')} <button type="button" className="font-bold text-zappy-600" onClick={() => nav('/provider/onboarding')}>{t('sp.pl.addService', 'Add a service')}</button></p>
              ) : services.map((s) => (
                <label key={s.code} className="flex items-center gap-2 py-1.5 text-sm text-slate-700">
                  <input type="checkbox" checked={form.services.includes(s.code)}
                    onChange={(e) => set('services', e.target.checked ? [...form.services, s.code] : form.services.filter((c) => c !== s.code))} />
                  {s.name}
                </label>
              ))}
            </div>
            <input className="input text-sm w-full" type="number" inputMode="numeric" min={1} placeholder={t('sp.pl.price', 'Price (₹)')} value={form.price} onChange={(e) => set('price', e.target.value)} />
            <input className="input text-sm w-full" placeholder={t('sp.pl.perkEg', 'Extra perk (optional), e.g. Free check-up')} maxLength={200} value={form.perk} onChange={(e) => set('perk', e.target.value)} />
            {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={() => submit('draft')}
                className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-700 disabled:opacity-50">{t('sp.saveDraft', 'Save draft')}</button>
              <button type="button" disabled={saving} onClick={() => submit('published')}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-zappy-600 py-3 text-sm font-bold text-white disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t('sp.publish', 'Publish')}
              </button>
            </div>
          </div>
        ) : !data?.plans?.length ? (
          <p className="py-16 text-center text-sm text-slate-500">{t('sp.noPlans', 'No plans yet. Tap New plan to create one.')}</p>
        ) : data.plans.map((p) => (
          <div key={p._id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-[#0F172A]">{p.title || t('sp.pl.untitled', 'Untitled plan')}</p>
                <p className="text-xs text-slate-500">{t(KINDS.find((k) => k.key === p.kind)?.tk, KINDS.find((k) => k.key === p.kind)?.label)} · ₹{Math.round(p.pricePaise / 100)}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {p.status === 'published' ? t('sp.published', 'Published') : t('sp.draft', 'Draft')}
              </span>
            </div>
            {!!p.services.length && <p className="mt-2 text-sm text-slate-600">{p.services.map(nameOf).join(', ')}</p>}
            {p.perk && <p className="mt-1 text-xs text-slate-500">{p.perk}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => { setError(''); setForm({ ...EMPTY, ...p, price: p.pricePaise ? String(p.pricePaise / 100) : '' }); }}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"><Pencil size={13} /> {t('sp.edit', 'Edit')}</button>
              <button onClick={() => del(p._id)} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600"><Trash2 size={13} /> {t('sp.delete', 'Delete')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
