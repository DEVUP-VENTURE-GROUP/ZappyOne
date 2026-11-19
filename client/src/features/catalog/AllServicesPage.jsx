import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PackageSearch } from 'lucide-react';
import { useGetServiceabilityQuery, useLiveCatalogQuery } from '@shared/services/api';
import { loadGeoLocation } from '@shared/hooks/useGeolocation';
import { trackSearch } from '@shared/hooks/useTelemetry';
import { areaPhoto, servicePhoto } from '@shared/components/home/serviceArt';
import { icon3dFor } from '@shared/config/icons3d';
import SEO from '@shared/components/SEO';
import { tintFor } from '../home/ServiceGrid';

/**
 * Everything bookable here, by area: the same page as the customer app.
 *
 * A chip per area (?category=<area>, or #domain-<area> from Home), then each
 * area as a photo grid: three cards to a row on a phone, six on a desktop. Only
 * services a live pro covers at the saved address show; with no address saved,
 * everything shows and the booking step asks for one.
 */

/** One service: its photo (or its 3D icon on the area's tint) and its name. The whole card is the one tap. */
function ServiceCard({ service, domainCode, onOpen }) {
  const [broken, setBroken] = useState(false);
  const photo = broken ? null : servicePhoto(service);
  return (
    <button type="button" onClick={onOpen} aria-label={service.name}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-white text-left transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_10px_24px_-10px_rgba(16,24,40,0.25)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zappy-600/25">
      <span className={`flex aspect-[5/4] w-full items-center justify-center overflow-hidden ${tintFor(domainCode).bg}`}>
        {photo
          ? <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" />
          : <img src={icon3dFor({ ...service, domainCode })} alt="" loading="lazy" className="h-[60%] w-[60%] object-contain" />}
      </span>
      <span className="line-clamp-2 flex min-h-[44px] items-center px-2.5 py-2 text-[13px] font-semibold leading-snug text-ink-900 sm:min-h-[52px] sm:text-[15px]">
        {service.name}
      </span>
    </button>
  );
}

/** An area's heading: its photo, its name and how many services it has here. */
function AreaHead({ domain, count }) {
  const [broken, setBroken] = useState(false);
  const photo = broken ? null : areaPhoto(domain);
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl ${tintFor(domain.code).bg}`}>
        {photo
          ? <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />
          : <img src={icon3dFor(domain)} alt="" loading="lazy" className="h-[60%] w-[60%] object-contain" />}
      </span>
      <div className="min-w-0">
        <h2 id={`domain-${domain.code}`} className="truncate text-[17px] font-bold text-ink-900 sm:text-[20px]">{domain.name}</h2>
        <p className="text-[13px] text-ink-500">{count} {count === 1 ? 'service' : 'services'}</p>
      </div>
    </div>
  );
}

function Chip({ label, active, onSelect, chipRef }) {
  return (
    <button ref={chipRef} type="button" onClick={onSelect} aria-pressed={active}
      className={`min-h-[36px] shrink-0 rounded-full border px-4 text-[14px] font-semibold transition-colors ${active
        ? 'border-zappy-600 bg-zappy-600 text-white'
        : 'border-line bg-white text-ink-700 hover:border-line-strong'}`}>
      {label}
    </button>
  );
}

const GRID = 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6';

export default function AllServicesPage() {
  const nav = useNavigate();
  const { hash } = useLocation();
  const [params, setParams] = useSearchParams();
  const here = loadGeoLocation();
  const { data: svc, isFetching: checkingArea } = useGetServiceabilityQuery({ lat: here?.lat, lng: here?.lng }, { skip: here?.lat == null });
  const { data, isLoading, isError, refetch } = useLiveCatalogQuery();
  // Hold the skeleton until we know what is bookable here, so the full catalog never flashes before it narrows.
  const settling = isLoading || (here?.lat != null && !svc && checkingArea);

  // Only what a live pro covers at this address; no address shows everything.
  const domains = useMemo(() => {
    const live = svc && svc.status !== 'not_here' ? new Set(svc.lines.map((l) => l.code)) : null;
    return (data?.domains || [])
      .map((d) => ({ ...d, services: d.services.filter((s) => !live || live.has(s.code)) }))
      .filter((d) => d.services.length);
  }, [data, svc]);

  // An area link from Home (#domain-<code>) becomes the area chip, so there is one way to pick an area.
  useEffect(() => {
    const code = hash.startsWith('#domain-') ? hash.slice('#domain-'.length) : null;
    if (code) nav({ pathname: '/services', search: `?category=${encodeURIComponent(code)}` }, { replace: true });
  }, [hash, nav]);

  const asked = params.get('category');
  const selected = domains.some((d) => d.code === asked) ? asked : 'all';
  const visible = selected === 'all' ? domains : domains.filter((d) => d.code === selected);

  // A chip picked (or an area opened from Home): bring that chip into view and start the list from the top.
  const chips = useRef({});
  const top = useRef(null);
  useEffect(() => {
    chips.current[selected]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selected, domains.length]);
  function pick(code) {
    const next = new URLSearchParams(params);
    if (code === 'all') next.delete('category'); else next.set('category', code);
    setParams(next, { replace: true });
    if (top.current && top.current.getBoundingClientRect().top < 0) top.current.scrollIntoView({ block: 'start' });
  }

  function open(s) {
    trackSearch({ category: s.code, lat: here?.lat, lng: here?.lng, result: 'served', userType: 'user' });
    nav(s.path);
  }

  let body = null;
  if (settling) {
    body = (
      <div className={GRID} aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[5/6] animate-pulse rounded-card bg-sunken" />)}
      </div>
    );
  } else if (isError) {
    body = (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-[15px] font-semibold text-ink-900">Could not load services.</p>
        <button type="button" onClick={() => refetch()} className="btn-primary">Try again</button>
      </div>
    );
  } else if (!domains.length) {
    body = (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zappy-50 text-zappy-600"><PackageSearch size={28} /></span>
        <p className="mt-1 text-[16px] font-bold text-ink-900">Nothing bookable here yet</p>
        <p className="text-[14px] text-ink-500">New pros join every week. Try another address.</p>
      </div>
    );
  } else {
    body = visible.map((d) => (
      <section key={d.code} aria-labelledby={`domain-${d.code}`} className="space-y-3 sm:space-y-4">
        <AreaHead domain={d} count={d.services.length} />
        <div className={GRID}>
          {d.services.map((s) => <ServiceCard key={s.code} service={s} domainCode={d.code} onOpen={() => open(s)} />)}
        </div>
      </section>
    ));
  }

  return (
    <div ref={top} className="min-h-screen bg-canvas pb-16">
      <SEO title="All services - ZappyOne" description="Every service ZappyOne can book at your address today, by area." />

      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <h1 className="text-[20px] font-bold text-ink-900 sm:text-[24px]">All services</h1>
          <p className="text-[13px] text-ink-500 sm:text-[14px]">What we can do for you today</p>
        </div>
        {domains.length > 1 ? (
          <nav aria-label="Service areas" className="mx-auto max-w-6xl">
            <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar sm:px-6">
              <Chip label="All" active={selected === 'all'} onSelect={() => pick('all')} chipRef={(el) => { chips.current.all = el; }} />
              {domains.map((d) => (
                <Chip key={d.code} label={d.name} active={selected === d.code} onSelect={() => pick(d.code)} chipRef={(el) => { chips.current[d.code] = el; }} />
              ))}
            </div>
          </nav>
        ) : <div className="pb-4" />}
      </header>

      <div className="mx-auto max-w-6xl space-y-7 px-4 pt-5 sm:space-y-10 sm:px-6 sm:pt-7">
        {body}
      </div>
    </div>
  );
}
