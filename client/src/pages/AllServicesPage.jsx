import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useGetServiceabilityQuery } from '@shared/services/api';
import { loadGeoLocation } from '@shared/hooks/useGeolocation';
import ComingSoonSheet from '../components/serviceability/ComingSoonSheet';
import { trackSearch } from '../hooks/useTelemetry';
import LiveServices from '@shared/components/home/LiveServices';
import SEO from '@shared/components/SEO';

/**
 * Everything we do, in one place.
 *
 * Every live service shows. Where nobody near the customer is verified for one
 * yet it reads "coming soon", and a tap offers "notify me" and is recorded as
 * demand — never a booking nobody can fulfil.
 */
export default function AllServicesPage() {
  const nav = useNavigate();
  const here = loadGeoLocation();
  const { data: svc } = useGetServiceabilityQuery({ lat: here?.lat, lng: here?.lng }, { skip: here?.lat == null });
  const [soon, setSoon] = useState(null);

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16">
      <SEO
        title="Services — ZappyOne"
        description="Phone and laptop repair at your door, diagnosed before you are quoted."
      />

      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <button onClick={() => nav(-1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <ArrowLeft size={17} strokeWidth={2.5} />
          </button>
          <div>
            <p className="font-bold text-[#0F172A]">All services</p>
            <p className="text-xs text-slate-400">What we can do for you today</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4">
        <LiveServices
          availableCodes={svc ? svc.lines.map((l) => l.code) : null}
          onOpenService={(code, served) => trackSearch({ category: code, lat: here?.lat, lng: here?.lng, result: served ? 'served' : 'no_service', userType: 'user' })}
          onUnavailable={setSoon}
        />
        <ComingSoonSheet service={soon} lat={here?.lat} lng={here?.lng} onClose={() => setSoon(null)} />
      </div>
    </div>
  );
}
