import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, Store, Wrench } from 'lucide-react';
import { useRepairVerticalsQuery } from '@shared/services/api';
import { SERVICE_ICONS } from '@shared/components/home/LiveServices';
import PlansNear from '../plans/PlansNear';

// The marketplace on the home: pick your own pro for any live service, and monthly plans near you; each part hides itself when there is nothing to show.
export default function HomeMarketplace() {
  const nav = useNavigate();
  const { data } = useRepairVerticalsQuery();
  const services = (data?.items || []).filter((s) => s.status === 'live').slice(0, 12);
  return (
    <div className="space-y-6">
      {services.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-[#0F172A]"><Store size={18} className="text-zappy-600" /> Pick your own pro</h2>
              <p className="text-[12.5px] text-slate-500">See ratings, prices and how soon they can come, then book the one you like.</p>
            </div>
          </div>
          <div className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
            {services.map((s, i) => {
              const Icon = SERVICE_ICONS[s.icon] || Wrench;
              return (
                <motion.button key={s.vertical} type="button" onClick={() => nav(`/providers/${s.vertical.replace(/_/g, '-')}`)}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} whileTap={{ scale: 0.97 }}
                  className="group flex w-40 shrink-0 snap-start flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-zappy-200 hover:shadow-sm">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zappy-50 text-zappy-600"><Icon size={19} /></span>
                  <span className="line-clamp-2 text-[13px] font-bold leading-snug text-[#0F172A]">{s.name}</span>
                  <span className="mt-auto flex items-center text-[11.5px] font-bold text-zappy-600">See pros <ChevronRight size={13} className="transition group-hover:translate-x-0.5" /></span>
                </motion.button>
              );
            })}
          </div>
        </section>
      )}
      <PlansNear />
    </div>
  );
}
