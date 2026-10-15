import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { useAdminSeasonsQuery } from '@shared/services/api';
import { themeOf } from '@shared/customer/season';
import { SectionHeader, Card, PageLoader, EmptyState } from '../../../ui/kit';
import SeasonEditor from './SeasonEditor';

const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Festive home: festivals on the customer home, websites and apps alike
 * (server content/season). Each has its dates, look, tiles and offer; home
 * shows the one running now, and is its usual self between festivals.
 */
export default function FestiveHome() {
  const { data, isLoading, isError } = useAdminSeasonsQuery();
  const [editing, setEditing] = useState(null); // null · 'new' · a season

  if (editing) {
    return (
      <div>
        <SectionHeader title={editing === 'new' ? 'New festive season' : editing.name} subtitle="The preview is the customer home's festive top, as phones show it." />
        <SeasonEditor season={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      </div>
    );
  }
  if (isError) return <EmptyState message="Could not load the seasons. Refresh to try again." />;
  if (isLoading) return <PageLoader />;
  const seasons = data?.seasons || [];

  return (
    <div>
      <SectionHeader title="Festive home" subtitle="Festivals on the customer home: their look, services and offer, between their dates.">
        <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus size={15} /> New season
        </button>
      </SectionHeader>
      {!seasons.length ? <EmptyState icon={Sparkles} message="No festivals yet. Home shows its usual top until you add one." /> : (
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
