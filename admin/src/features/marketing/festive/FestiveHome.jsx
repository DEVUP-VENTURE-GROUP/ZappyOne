import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAdminSeasonsQuery, useAdminCreateSeasonMutation } from '@shared/services/api';
import { themeOf } from '@shared/customer/season';
import { SectionHeader, Card, PageLoader, EmptyState } from '../../../ui/kit';
import SeasonEditor from './SeasonEditor';

const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Festive home: festivals on the customer home, websites and apps alike
 * (server content/season). Each has its dates, look, tiles and offer; home
 * shows the one running now. Without one of yours, the built-in festival
 * calendar shows (content/festival-calendar): customise one to add photos or
 * an offer, or switch it off.
 */
export default function FestiveHome() {
  const { data, isLoading, isError } = useAdminSeasonsQuery();
  const [editing, setEditing] = useState(null); // null · 'new' · a season (with no _id: a new one, prefilled)
  const [create, { isLoading: switching }] = useAdminCreateSeasonMutation();
  const customise = (f) => setEditing({ ...f, _id: undefined, name: f.name, isActive: true, promoCode: '' });
  async function switchOff(f) {
    try {
      await create({ name: `${f.name} (off)`, theme: f.theme, headline: f.headline, startAt: f.startAt, endAt: f.endAt, isActive: false }).unwrap();
      toast.success(`${f.name} will not show`);
    } catch (err) { toast.error(err?.data?.error || 'Could not switch it off'); }
  }

  if (editing) {
    return (
      <div>
        <SectionHeader title={editing === 'new' || !editing._id ? 'New festive season' : editing.name} subtitle="The preview is the customer home's festive top, as phones show it." />
        <SeasonEditor season={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      </div>
    );
  }
  if (isError) return <EmptyState message="Could not load the seasons. Refresh to try again." />;
  if (isLoading) return <PageLoader />;
  const seasons = data?.seasons || [];
  // Built-in festivals not already covered by a season of yours over the same days.
  const auto = (data?.auto || []).filter((f) => !seasons.some((s) => new Date(s.startAt) < new Date(f.endAt) && new Date(s.endAt) > new Date(f.startAt)));

  return (
    <div>
      <SectionHeader title="Festive home" subtitle="Festivals on the customer home: their look, services and offer, between their dates.">
        <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus size={15} /> New season
        </button>
      </SectionHeader>
      {auto.length > 0 && (
        <Card className="mb-5 p-4">
          <p className="text-sm font-bold text-slate-800">Automatic festivals</p>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Home turns festive for these by itself, with no offer. Customise one to add photos or a promo code, or switch it off.</p>
          <div className="mt-3 divide-y divide-slate-100">
            {auto.map((f) => {
              const t = themeOf(f.theme);
              const now = Date.now() >= new Date(f.startAt).getTime();
              return (
                <div key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="h-9 w-9 shrink-0 rounded-lg" style={{ background: `linear-gradient(180deg, ${t.top}, ${t.bottom})` }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{f.greeting}{now && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Showing now</span>}</p>
                    <p className="text-[12px] text-slate-400">{day(f.startAt)} – {day(new Date(new Date(f.endAt).getTime() - 1))}</p>
                  </div>
                  <button type="button" onClick={() => customise(f)} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-blue-700 hover:bg-blue-50">Customise</button>
                  <button type="button" onClick={() => switchOff(f)} disabled={switching} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50">Switch off</button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {!seasons.length ? <EmptyState icon={Sparkles} message="None of your own yet. The automatic festivals above show until you add one." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {seasons.map((s) => {
            const t = themeOf(s.theme);
            return (
              <button key={s.id} type="button" onClick={() => setEditing(s)} className="text-left">
                <Card className="overflow-hidden p-0 transition hover:shadow-md">
                  <div className="h-16" style={{ background: `linear-gradient(180deg, ${t.top}, ${t.bottom})` }} />
                  <div className="space-y-1 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-slate-800">{s.name}</p>
                      {s.running ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Showing now</span>
                        : !s.isActive ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Off</span> : null}
                    </div>
                    <p className="truncate text-[12.5px] text-slate-600">{s.headline}</p>
                    <p className="text-[12px] text-slate-400">{day(s.startAt)} – {day(s.endAt)} · {s.tiles?.length || 0} tiles{s.promoCode ? ` · ${s.promoCode}${s.offerLive ? '' : ' (not live)'}` : ''}</p>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
