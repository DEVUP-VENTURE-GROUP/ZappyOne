import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Wrench } from 'lucide-react';
import { useLiveCatalogQuery } from '@shared/services/api';
import { CATEGORY_ICONS } from '@shared/components/home/LiveServices';
import SEO from '@shared/components/SEO';
import { categoryPhoto } from '@shared/components/home/problemArt';
import { ProblemCard, ProblemGrid } from './ProblemCard';

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
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 size={24} className="animate-spin text-zappy-400" />
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
      <div className="min-h-screen bg-canvas">
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
  const cover = categoryPhoto(vertical, category);

  return (
    <div className="min-h-screen bg-canvas pb-16">
      <SEO
        title={`${category.name} — ${service.name} | ZappyOne`}
        description={`${category.name} problems we fix, with a technician at your door. Diagnosed before you are quoted.`}
      />

      <Header
        title={category.name}
        subtitle={service.name}
        onBack={() => nav(-1)}
      />

      <div className="mx-auto max-w-4xl px-4">
        <div className="mt-4 flex items-center gap-4 overflow-hidden rounded-card border border-line bg-white p-3">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-btn bg-sunken">
            {cover
              ? <img src={cover} alt="" className="h-full w-full object-cover" />
              : <Icon size={28} className="text-zappy-600" strokeWidth={1.6} />}
          </span>
          <div className="min-w-0">
            <p className="text-[19px] font-bold text-ink-900">{category.name}</p>
            <p className="mt-0.5 text-[13px] text-ink-500">
              {category.problems.length} {category.problems.length === 1 ? 'problem' : 'problems'} we fix. Pick the closest match.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <ProblemGrid>
            {category.problems.map((p) => (
              <ProblemCard key={p.code} vertical={vertical} problem={p}
                onPick={() => nav(`${service.path}?problem=${encodeURIComponent(p.code)}`)} />
            ))}
          </ProblemGrid>
        </div>

        {/* The list is curated, so leaving is a real option — not a dead end. */}
        <button
          onClick={() => nav(service.path)}
          className="mt-4 w-full rounded-card border border-dashed border-line-strong bg-white p-4 text-center"
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
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
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
