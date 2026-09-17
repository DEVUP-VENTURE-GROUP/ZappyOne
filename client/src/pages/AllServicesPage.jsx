import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import LiveServices from '../components/home/LiveServices';
import SEO from '../components/SEO';

/**
 * Everything a customer can book, in one place.
 *
 * This replaced the old all-services catalog. The catalog listed every service
 * the platform had ever defined, including ones with no verified providers and
 * no finished flow — a customer could tap through to a dead end. This page
 * shows the live catalog only, which is the same list providers can be verified
 * against, so the two can never disagree.
 */
export default function AllServicesPage() {
  const nav = useNavigate();

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
        <LiveServices />
      </div>
    </div>
  );
}
