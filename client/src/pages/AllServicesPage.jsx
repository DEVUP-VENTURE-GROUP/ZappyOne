import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useGetServiceabilityQuery } from '@shared/services/api';
import { loadGeoLocation } from '@shared/hooks/useGeolocation';
import { trackSearch } from '../hooks/useTelemetry';
import LiveServices from '@shared/components/home/LiveServices';
import SEO from '@shared/components/SEO';

/**
 * Everything we do, in one place.
 *
 * Every live service shows and opens. Each tap is recorded as demand (served,
 * or wanted where nobody is verified yet); the booking step says if nobody can
 * come to the address.
 */
export default function AllServicesPage() {
  const nav = useNavigate();
  const here = loadGeoLocation();
  const { data: svc } = useGetServiceabilityQuery({ lat: here?.lat, lng: here?.lng }, { skip: here?.lat == null });

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
        />
      </div>
    </div>
  );
}
