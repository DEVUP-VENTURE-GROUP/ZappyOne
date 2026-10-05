import { useSearchParams } from 'react-router-dom';
import TodayView from './TodayView';
import DemandView from './DemandView';
import SupplyView from './SupplyView';
import FunnelView from './FunnelView';
import CustomersView from './CustomersView';
import MoneyView from './MoneyView';
import MapView from './MapView';

/**
 * Insights: seven screens, each answering one question a decision hangs on,
 * read from the bookings the platform takes today (repair, pet, helping,
 * events), searches and visits. The period switch applies to every screen;
 * screens that need a longer window say so and use it.
 */
const SCREENS = [
  { id: 'today', label: 'Today', question: 'Is the business healthy?', Comp: TodayView },
  { id: 'demand', label: 'Demand', question: 'What do people want that we do not give them?', Comp: DemandView },
  { id: 'supply', label: 'Supply', question: 'Do we have enough providers, in the right places?', Comp: SupplyView },
  { id: 'funnel', label: 'Funnel', question: 'Where do customers drop off?', Comp: FunnelView },
  { id: 'customers', label: 'Customers', question: 'Do people come back, and are they happy?', Comp: CustomersView },
  { id: 'money', label: 'Money', question: 'What makes us money?', Comp: MoneyView },
  { id: 'map', label: 'Map', question: 'Where is the business, and where should it go next?', Comp: MapView },
];
const PERIODS = [[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']];

export default function Insights() {
  const [params, setParams] = useSearchParams();
  const screen = SCREENS.find((x) => x.id === params.get('sub')) || SCREENS[0];
  const days = [1, 7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 7;

  function set(key, value) {
    const next = new URLSearchParams(params);
    next.set('tab', 'insights');
    next.set(key, String(value));
    setParams(next, { replace: true });
  }

  const Active = screen.Comp;
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Insights</h1>
          <p className="mt-1 text-[13px] text-slate-500">{screen.question}</p>
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-[12.5px] font-medium" role="group" aria-label="Period">
          {PERIODS.map(([d, text]) => (
            <button key={d} type="button" onClick={() => set('days', d)} aria-pressed={days === d}
              className={`rounded-lg px-3 py-1.5 transition ${days === d ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>{text}</button>
          ))}
        </div>
      </div>

      <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {SCREENS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={screen.id === x.id} onClick={() => set('sub', x.id)}
            className={`-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold transition ${screen.id === x.id ? 'border-[#1F4FD8] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {x.label}
          </button>
        ))}
      </div>

      <Active days={days} />
    </div>
  );
}
