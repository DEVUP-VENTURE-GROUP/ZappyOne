import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Store, Star, ShieldCheck, MapPin, Calendar, Loader2, ChevronRight } from 'lucide-react';
import { useGetShopProfileQuery } from '../services/api';

const SERVICE_LABELS = {
  screen_replacement: 'Phone Screen Replacement', battery_replacement: 'Phone Battery Replacement',
  charging_issue: 'Phone Charging Issue', speaker_mic_issue: 'Phone Speaker/Mic Issue',
  camera_issue: 'Phone Camera Issue', water_damage: 'Phone Water Damage',
  data_recovery: 'Phone Data Recovery', device_not_turning_on: 'Phone Not Turning On',
  laptop_screen_issue: 'Laptop Screen Repair', laptop_motherboard_issue: 'Laptop Motherboard Repair',
  laptop_keyboard_issue: 'Laptop Keyboard Repair', laptop_ssd_upgrade: 'Laptop SSD Upgrade',
  laptop_ram_upgrade: 'Laptop RAM Upgrade', laptop_charging_issue: 'Laptop Charging Issue',
  laptop_virus_removal: 'Laptop Virus Removal', laptop_data_recovery: 'Laptop Data Recovery',
  smart_tv_repair: 'Smart TV Repair', cctv_install: 'CCTV Installation',
  router_troubleshoot: 'Router Troubleshoot', event_decorator: 'Event Decoration',
};

export default function ShopPublicProfilePage() {
  const nav = useNavigate();
  const { id } = useParams();
  const { data, isLoading } = useGetShopProfileQuery(id);
  const shop = data?.shop;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 size={28} className="text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <Store size={32} className="text-slate-300" />
        <p className="font-bold text-slate-700">Shop not found</p>
        <button onClick={() => nav('/nearby-shops')} className="btn-primary px-6">Browse other shops</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-32">
      <div className="relative h-52 bg-slate-200">
        {shop.coverImageUrl ? (
          <img src={shop.coverImageUrl} alt={shop.businessName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-100 to-indigo-50">
            <Store size={40} className="text-indigo-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
        <button onClick={() => nav(-1)} className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow">
          <ArrowLeft size={18} strokeWidth={2.5} />
        </button>
      </div>

      <div className="max-w-lg lg:max-w-2xl mx-auto px-4 -mt-8 relative z-10">
        <div className="card">
          <div className="flex items-start gap-1.5">
            <h1 className="text-lg font-black text-[#0F172A]">{shop.businessName}</h1>
            <ShieldCheck size={17} className="text-emerald-500 mt-0.5 shrink-0" />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{shop.category || 'Local Repair Shop'}</p>
          <div className="flex items-center gap-4 mt-2">
            {shop.rating > 0 && (
              <span className="flex items-center gap-1 text-sm font-bold text-slate-700">
                <Star size={14} className="text-amber-400 fill-amber-400" /> {shop.rating.toFixed(1)}
                {shop.reviewCount > 0 && <span className="text-xs text-slate-400 font-normal">({shop.reviewCount})</span>}
              </span>
            )}
            {shop.completedJobs > 0 && <span className="text-xs text-slate-400">{shop.completedJobs} jobs completed</span>}
            {shop.yearsActive > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Calendar size={11} /> {shop.yearsActive}+ yrs
              </span>
            )}
          </div>
        </div>

        {shop.bio && (
          <div className="card mt-3">
            <p className="text-sm text-slate-600 leading-relaxed">{shop.bio}</p>
          </div>
        )}

        {shop.address?.text && (
          <div className="card mt-3 flex items-start gap-2.5">
            <MapPin size={15} className="text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[#0F172A]">{shop.address.text}</p>
              {shop.address.landmark && <p className="text-xs text-slate-400 mt-0.5">Near {shop.address.landmark}</p>}
            </div>
          </div>
        )}

        <div className="mt-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 px-1">Book a service at this shop</p>
          <div className="space-y-2">
            {(shop.services || []).map((s) => (
              <button key={s} onClick={() => nav(`/book/${s}?shopId=${shop._id}`)}
                className="card w-full flex items-center justify-between text-left hover:ring-2 hover:ring-indigo-100 transition">
                <span className="text-sm font-semibold text-[#0F172A]">{SERVICE_LABELS[s] || s.replace(/_/g, ' ')}</span>
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
              </button>
            ))}
            {(!shop.services || shop.services.length === 0) && (
              <p className="text-xs text-slate-400 px-1">This shop hasn't listed its services yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
