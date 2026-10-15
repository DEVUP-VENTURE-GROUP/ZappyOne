import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import {
  useAdminCreateSeasonMutation, useAdminUpdateSeasonMutation, useAdminDeleteSeasonMutation,
  useAdminListPromosQuery, useLiveCatalogQuery,
} from '@shared/services/api';
import { THEMES, themeOf } from '@shared/customer/season';
import FestiveHero from '@shared/components/home/festive/FestiveHero';
import FestiveMotif from '@shared/components/home/festive/FestiveMotif';
import ImageUploadField from '@shared/components/common/ImageUploadField';
import { Card, FormRow, Input, Select, SaveBtn } from '../../../ui/kit';
import SeasonTileRow from './SeasonTileRow';

const local = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const BLANK_TILE = { title: '', serviceCode: '', imageUrl: '', badge: '' };

/** A promo as the offer strip shows it, only while it is live (server content/season liveOffer). */
function liveOffer(p, now = Date.now()) {
  if (!p || !p.isActive) return null;
  if (new Date(p.validity?.startAt) > now || new Date(p.validity?.endAt) < now) return null;
  return { code: p.code, name: p.name, type: p.type, discountValue: p.discount?.value, maxDiscountPaise: p.discount?.maxDiscountPaise || 0, minOrderPaise: p.discount?.minOrderPaise || 0 };
}

/**
 * Create or edit a festive season, with the customer home's festive top
 * previewed live beside it (the same component the website shows).
 */
export default function SeasonEditor({ season, onDone }) {
  const [form, setForm] = useState(() => ({
    name: season?.name || '', theme: season?.theme || 'navratri', greeting: season?.greeting || '',
    headline: season?.headline || '', subline: season?.subline || '', artUrl: season?.artUrl || '',
    startAt: local(season?.startAt), endAt: local(season?.endAt),
    tiles: season?.tiles?.length ? season.tiles.map((t) => ({ ...BLANK_TILE, ...t })) : [],
    promoCode: season?.promoCode || '', isActive: season?.isActive ?? true,
  }));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const [create, { isLoading: creating }] = useAdminCreateSeasonMutation();
  const [update, { isLoading: updating }] = useAdminUpdateSeasonMutation();
  const [remove, { isLoading: removing }] = useAdminDeleteSeasonMutation();
  const { data: catalog } = useLiveCatalogQuery();
  const { data: promoData } = useAdminListPromosQuery({ page: 1 });

  const services = useMemo(() => (catalog?.domains || []).flatMap((d) => d.services.map((s) => ({ ...s, domainCode: d.code }))), [catalog]);
  const promos = promoData?.promos || [];
  const picked = promos.find((p) => p.code === form.promoCode);
  const offer = liveOffer(picked);
  const theme = themeOf(form.theme);
  const preview = { ...form, headline: form.headline || 'Your headline', tiles: form.tiles.filter((t) => t.title && t.serviceCode), offer };

  const valid = form.name.trim() && form.headline.trim() && form.startAt && form.endAt && new Date(form.endAt) > new Date(form.startAt)
    && form.tiles.every((t) => t.title.trim() && t.serviceCode);

  async function save() {
    const body = {
      ...form, startAt: new Date(form.startAt).toISOString(), endAt: new Date(form.endAt).toISOString(),
      tiles: form.tiles.map(({ title, serviceCode, imageUrl, badge }) => ({ title, serviceCode, imageUrl: imageUrl || '', badge: badge || '' })),
    };
    try {
      if (season?._id) await update({ id: season._id, ...body }).unwrap(); else await create(body).unwrap();
      toast.success('Saved. Home shows it between its dates.');
      onDone();
    } catch (err) { toast.error(err?.data?.error || 'Could not save. Try again.'); }
  }

  async function del() {
    try { await remove(season._id).unwrap(); toast.success('Season deleted'); onDone(); } catch (err) { toast.error(err?.data?.error || 'Could not delete'); }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="space-y-4 p-5">
        <FormRow label="Theme">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(THEMES).map(([key, t]) => (
              <button key={key} type="button" onClick={() => set('theme')(key)} aria-pressed={form.theme === key}
                className={`relative h-20 overflow-hidden rounded-xl text-left ring-2 transition ${form.theme === key ? 'ring-blue-600' : 'ring-transparent hover:ring-slate-300'}`}
                style={{ background: `linear-gradient(180deg, ${t.top}, ${t.bottom})` }}>
                <FestiveMotif theme={key} />
                <span className="absolute inset-x-2 bottom-1.5 truncate text-[11px] font-bold" style={{ color: t.ink }}>{t.label}</span>
              </button>
            ))}
          </div>
        </FormRow>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="Name (admin only)"><Input value={form.name} onChange={set('name')} placeholder="Navratri 2026" maxLength={60} /></FormRow>
          <FormRow label="Greeting"><Input value={form.greeting} onChange={set('greeting')} placeholder="Happy Navratri" maxLength={40} /></FormRow>
        </div>
        <FormRow label="Headline"><Input value={form.headline} onChange={set('headline')} placeholder="Festive-ready homes, by verified pros" maxLength={60} /></FormRow>
        <FormRow label="Line under it"><Input value={form.subline} onChange={set('subline')} placeholder="Deep cleaning, repairs and décor before the guests arrive" maxLength={120} /></FormRow>
        <FormRow label="Festival artwork" hint="Optional, but it is what makes the top feel festive: a transparent PNG or WebP of the festival (Durga's eyes, diyas, kites), about 1200×400.">
          <ImageUploadField value={form.artUrl} onChange={set('artUrl')} folder="seasons" label="festival artwork" accept="image/*" maxMb={5} />
        </FormRow>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="Starts"><Input type="datetime-local" value={form.startAt} onChange={set('startAt')} /></FormRow>
          <FormRow label="Ends"><Input type="datetime-local" value={form.endAt} onChange={set('endAt')} /></FormRow>
        </div>

        <FormRow label={`Tiles (${form.tiles.length}/6)`} hint="Each opens its service. A tile for a service not live is not shown.">
          <div className="space-y-2">
            {form.tiles.map((t, i) => (
              <SeasonTileRow key={i} tile={t} services={services}
                onChange={(next) => setForm((f) => ({ ...f, tiles: f.tiles.map((x, j) => (j === i ? next : x)) }))}
                onRemove={() => setForm((f) => ({ ...f, tiles: f.tiles.filter((_, j) => j !== i) }))} />
            ))}
            {form.tiles.length < 6 && (
              <button type="button" onClick={() => setForm((f) => ({ ...f, tiles: [...f.tiles, { ...BLANK_TILE }] }))}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                <Plus size={15} /> Add a tile
              </button>
            )}
          </div>
        </FormRow>

        <FormRow label="Offer" hint={form.promoCode && !offer ? 'This code is not live right now, so no offer strip shows.' : 'A promo code from Promo codes. The strip shows exactly what it gives.'}>
          <Select value={form.promoCode} onChange={set('promoCode')}>
            <option value="">No offer</option>
            {promos.map((p) => <option key={p.code} value={p.code}>{p.code}, {p.name}</option>)}
          </Select>
        </FormRow>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="h-4 w-4" /> Show it between its dates
        </label>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="flex gap-2">
            <SaveBtn loading={creating || updating} onClick={valid ? save : undefined}>{season?._id ? 'Save season' : 'Create season'}</SaveBtn>
            <button type="button" onClick={onDone} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
          </div>
          {season?._id && (
            <button type="button" onClick={del} disabled={removing} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
        {!valid && <p className="text-[12px] text-amber-700">Name, headline and both dates (ending after it starts) are needed, and every tile needs a title and a service.</p>}
      </Card>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live preview, phone</p>
        <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px] border-[6px] border-slate-900 bg-white">
          <FestiveHero season={preview} theme={theme} services={services} onOpen={() => {}} />
          <div className="h-24 bg-canvas" />
        </div>
      </div>
    </div>
  );
}
