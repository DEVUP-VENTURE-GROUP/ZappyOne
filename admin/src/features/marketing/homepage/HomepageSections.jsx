import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Info, Lock } from 'lucide-react';
import { HOME_SECTIONS } from '@shared/config/homepageContent';
import { Card, SectionHeader } from '../../../ui/kit';

/**
 * Homepage → Sections: what each part of the customer homepage shows, what
 * drives it, and where to change it.
 *
 * Titles, order and visibility are not editable here because the server has
 * no place to keep them (no homepage-layout setting exists in any API), and a
 * setting saved only in this browser would never reach a customer. This view
 * says so, and links each section to the screen that really controls it.
 */

const DESTINATIONS = {
  banners: { label: 'Banners', params: { tab: 'homepage', sub: 'banners' } },
  services: { label: 'Services catalogue', params: { tab: 'services' } },
  shops: { label: 'Shops', params: { tab: 'shops' } },
};

export default function HomepageSections() {
  const [, setParams] = useSearchParams();

  return (
    <div>
      <SectionHeader title="Section manager" subtitle="The customer homepage, top to bottom: what each section shows and where it is controlled." />

      <div className="mb-4 flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-[13px] leading-relaxed text-blue-900">
        <Info size={16} className="mt-0.5 shrink-0" />
        <span>
          Section titles, order and on/off switches are fixed for now: the server has no setting that stores a homepage
          layout, so changes made here could not reach customers. Sections with nothing real to show hide themselves
          (for example, Campaign banners appear only while a campaign banner is live). Customer-specific sections always
          use the signed-in customer’s own bookings.
        </span>
      </div>

      <Card className="divide-y divide-slate-100">
        {HOME_SECTIONS.map((s, i) => {
          const dest = s.managedIn && DESTINATIONS[s.managedIn];
          return (
            <div key={s.id} className="flex items-center gap-4 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[13px] font-bold tabular-nums text-slate-500">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{s.title}</p>
                <p className="text-[12px] text-slate-500">{s.source}</p>
              </div>
              {dest ? (
                <button type="button" onClick={() => setParams(new URLSearchParams(dest.params), { replace: false })}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-blue-600 hover:bg-blue-50">
                  {dest.label} <ArrowRight size={13} />
                </button>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-[12px] text-slate-400"><Lock size={12} /> Automatic</span>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
