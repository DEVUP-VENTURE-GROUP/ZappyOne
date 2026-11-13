import { useMemo, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { useLiveCatalogQuery } from '@shared/services/api';
import PromoBanner from '@shared/components/home/PromoBanner';
import { ZappyWordmark } from '@shared/components/common/ZappyLogo';
import { splitHomeAds } from '@shared/config/homepageContent';
import { Card, PageLoader, SectionHeader } from '../../../ui/kit';
import { liveState, useHomepageBanners } from './useHomepageBanners';

/**
 * Homepage → Preview: the homepage's shape with the real banners in it, on a
 * desktop or phone frame. Banners render through the same component the
 * customer app uses; data-driven sections are shown as labelled outlines,
 * because their content depends on the customer and their location.
 */

function Outline({ title, note, h = 'h-24' }) {
  return (
    <div className={`flex ${h} flex-col justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 px-4`}>
      <p className="text-[13px] font-bold text-slate-700">{title}</p>
      <p className="text-[11px] text-slate-400">{note}</p>
    </div>
  );
}

export default function HomepagePreview() {
  const { banners, loading } = useHomepageBanners();
  const { data: catalog } = useLiveCatalogQuery();
  const [device, setDevice] = useState('desktop');
  const [includeUnpublished, setIncludeUnpublished] = useState(false);

  const shown = useMemo(() => banners.filter((b) => (includeUnpublished
    ? ['live', 'scheduled', 'draft', 'paused'].includes(liveState(b))
    : liveState(b) === 'live')), [banners, includeUnpublished]);
  const { hero, campaign, offer } = splitHomeAds(shown);
  const serviceCount = (catalog?.domains || []).reduce((n, d) => n + d.services.length, 0);
  const mobile = device === 'mobile';

  return (
    <div>
      <SectionHeader title="Homepage preview" subtitle="How the homepage’s banner sections will look. Other sections fill from live data for each customer.">
        <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
          <input type="checkbox" checked={includeUnpublished} onChange={(e) => setIncludeUnpublished(e.target.checked)} /> Include drafts &amp; scheduled
        </label>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {[['desktop', Monitor, 'Desktop'], ['mobile', Smartphone, 'Phone']].map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => setDevice(k)} aria-pressed={device === k}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold ${device === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </SectionHeader>

      {loading ? <PageLoader /> : (
        <Card className="overflow-hidden bg-slate-100 p-4 sm:p-6">
          <div className={`mx-auto space-y-5 rounded-2xl bg-[#F7F8FB] p-4 shadow-sm ring-1 ring-slate-200 ${mobile ? 'max-w-[380px]' : 'max-w-[1100px] sm:p-6'}`}>
            <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3">
              <ZappyWordmark size={mobile ? 22 : 26} />
              <span className="text-[11px] text-slate-400">Location · notifications · account</span>
            </div>
            <div className="h-11 rounded-full border border-slate-200 bg-white px-4 text-[13px] leading-[44px] text-slate-400">Search for services or problems…</div>
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-blue-50 p-1 text-center text-[13px] font-bold">
              <span className="rounded-xl bg-[#1F4FD8] py-2.5 text-white">Book a service</span>
              <span className="py-2.5 text-blue-700">Local stores</span>
            </div>

            {hero.length ? (
              <div>
                <PromoBanner ad={hero[0]} variant="hero" device={device} />
                {hero.length > 1 && <p className="mt-1.5 text-center text-[11px] text-slate-400">+ {hero.length - 1} more slide{hero.length > 2 ? 's' : ''}, rotating every 6 s</p>}
              </div>
            ) : <Outline h={mobile ? 'h-[188px]' : 'h-[340px]'} title="Hero carousel" note="No hero banner live: customers see the service catalogue slides." />}

            <Outline title="Explore services" note={`${serviceCount} live services from the catalogue`} />
            <Outline h="h-20" title="Discover local stores on ZappyOne" note="Fixed promotion → verified shops" />
            <Outline title="Popular services near you" note="Catalogue services flagged popular, then those bookable at the customer’s address" />

            {campaign.length > 0 && (
              <div className={mobile ? 'space-y-3' : 'grid grid-cols-2 gap-3'}>
                {campaign.map((ad) => <PromoBanner key={ad._id} ad={ad} variant="campaign" device={device} />)}
              </div>
            )}

            <Outline title="Explore local stores" note="Verified shops within 10 km (signed-in customers)" />

            {offer.length > 0 ? (
              <div>
                <p className="mb-2 text-[15px] font-bold text-slate-900">Offers &amp; deals for you</p>
                <div className={mobile ? 'flex gap-3 overflow-x-auto' : 'grid grid-cols-3 gap-3'}>
                  {offer.map((ad) => <div key={ad._id} className={mobile ? 'w-[260px] shrink-0' : ''}><PromoBanner ad={ad} variant="offer" device={device} /></div>)}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">Live promo codes the customer can use are added after these.</p>
              </div>
            ) : <Outline h="h-20" title="Offers & deals" note="No offer cards live: shows the customer’s usable promo codes, or hides." />}

            <Outline h="h-20" title="Book again · Your recent activity" note="From the signed-in customer’s own bookings" />
          </div>
        </Card>
      )}
    </div>
  );
}
