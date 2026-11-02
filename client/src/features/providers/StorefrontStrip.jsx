import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { ChevronRight, Star, Store } from 'lucide-react';
import { useStorefrontsQuery } from '@shared/services/api';
import { selectLocation, selectHasLocation } from '@shared/store/locationSlice';

// Inside a booking flow: the verified providers near you for this service, a tap away; hidden when none or when one is already chosen.
export default function StorefrontStrip({ vertical }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const loc = useSelector(selectLocation);
  const hasLocation = useSelector(selectHasLocation);
  const { data } = useStorefrontsQuery({ vertical, lat: loc.lat, lng: loc.lng }, { skip: !hasLocation || !!params.get('provider') });
  const top = (data?.items || []).slice(0, 3);
  if (!top.length) return null;
  return (
    <motion.button type="button" onClick={() => nav(`/providers/${vertical.replace(/_/g, '-')}`)} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.98 }}
      className="card flex w-full items-center gap-3 text-left ring-zappy-100 hover:shadow-md">
      <span className="flex -space-x-2">
        {top.map((s) => (
          <span key={`${s.kind}:${s.id}`} className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-zappy-50 ring-2 ring-white">
            {s.imageUrl ? <img src={s.imageUrl} alt="" className="h-full w-full object-cover" /> : <Store size={15} className="text-zappy-500" />}
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-bold text-[#0F172A]">Choose who comes</span>
        <span className="block truncate text-[12px] text-slate-500">{data.total} verified near you{top[0].rating != null ? ` · top rated ${top[0].rating.toFixed(1)}` : ''}</span>
      </span>
      {top[0].rating != null && <Star size={14} className="fill-amber-400 text-amber-400" />}
      <ChevronRight size={18} className="text-slate-400" />
    </motion.button>
  );
}
