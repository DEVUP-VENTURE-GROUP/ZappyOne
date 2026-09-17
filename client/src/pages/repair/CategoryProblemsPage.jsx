import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, AlertTriangle, Loader2, Wrench } from 'lucide-react';
import { useLiveCatalogQuery } from '../../services/api';
import { CATEGORY_ICONS } from '../../components/home/LiveServices';
import SEO from '../../components/SEO';

/**
 * Everything under one heading — Display, Storage, Connectivity.
 *
 * The heading is the first real choice a customer makes, and the list behind it
 * is long: a hundred-plus symptoms per service. Putting it on its own page lets
 * someone scan for their exact problem instead of hunting through an accordion,
 * and gives each heading a link worth sharing.
 *
 * Choosing a symptom starts the booking flow with it filled in. It does NOT
 * decide the repair — the flow still runs its questions first, because "cracked
 * screen" covers both a ₹1,200 glass swap and a ₹18,000 panel.
 */
export default function CategoryProblemsPage() {
  const nav = useNavigate();
  const { vertical, categoryCode } = useParams();
  const { data, isLoading } = useLiveCatalogQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB]">
        <Loader2 size={24} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  // Find the service this heading belongs to, so its problems link into the
  // right booking flow rather than a guessed path.
  const service = (data?.domains || [])
    .flatMap((d) => d.services)
    .find((s) => (s.artKey || s.code) === vertical);
  const category = (service?.coverage || []).find((c) => c.code === categoryCode);

  if (!service || !category) {
    return (
      <div className="min-h-screen bg-[#F9FAFB]">
        <Header title="Not found" onBack={() => nav('/services')} />
        <div className="mx-auto max-w-2xl px-4 py-10 text-center">
          <p className="text-sm font-bold text-slate-700">This category isn't available</p>
          <p className="mt-1 text-xs text-slate-500">It may have been renamed or taken offline.</p>
          <button onClick={() => nav('/services')} className="btn-primary mt-4">See all services</button>
        </div>
      </div>
    );
  }

  const Icon = CATEGORY_ICONS[category.code] || Wrench;

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-16">
      <SEO
        title={`${category.name} — ${service.name} | ZappyOne`}
        description={`${category.name} problems we fix, with a technician at your door. Diagnosed before you are quoted.`}
      />

      <Header
        title={category.name}
        subtitle={service.name}
        onBack={() => nav(-1)}
      />

      <div className="mx-auto max-w-2xl px-4">
        <div className="mt-4 flex items-center gap-3 overflow-hidden rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-indigo-50">
            {category.imageUrl
              ? <img src={category.imageUrl} alt="" className="h-full w-full object-cover" />
              : <Icon size={24} className="text-indigo-500" strokeWidth={1.6} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-[#0F172A]">{category.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {category.problems.length} {category.problems.length === 1 ? 'issue' : 'issues'} we handle ·
              pick the closest match
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {category.problems.map((p) => (
            <button
              key={p.code}
              onClick={() => nav(`${service.path}?problem=${encodeURIComponent(p.code)}`)}
              className="group flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left ring-1 ring-slate-200/70 transition hover:ring-indigo-200"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#0F172A]">{p.name}</span>
                {p.requiresDiagnosis && (
                  <span className="mt-0.5 block text-[11px] font-semibold text-amber-600">
                    Priced after inspection
                  </span>
                )}
              </span>
              {p.severity === 'critical' && (
                <AlertTriangle size={15} className="shrink-0 text-red-500" />
              )}
              <ChevronRight size={16} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-400" />
            </button>
          ))}
        </div>

        {/* The list is curated, so leaving is a real option — not a dead end. */}
        <button
          onClick={() => nav(service.path)}
          className="mt-4 w-full rounded-2xl border border-dashed border-slate-200 p-4 text-center"
        >
          <span className="block text-sm font-bold text-slate-700">Not seeing your problem?</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Start the booking anyway — the technician diagnoses it on site.
          </span>
        </button>
      </div>
    </div>
  );
}

function Header({ title, subtitle, onBack }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <button onClick={onBack} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
          <ArrowLeft size={17} strokeWidth={2.5} />
        </button>
        <div className="min-w-0">
          <p className="truncate font-bold text-[#0F172A]">{title}</p>
          {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
    </header>
  );
}
