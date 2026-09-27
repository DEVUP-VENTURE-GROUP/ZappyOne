import {
  Battery, Bolt, Droplets, Wind, Hammer, Users, Sparkles, Paintbrush2,
  Smartphone, Home, Car, Wrench, Laptop, Bike, Shield, Tv, Dog, Heart, Calendar, Wifi,
} from 'lucide-react';

export const TABS = [
  { key: 'mobile',       label: 'Mobile Phone',     Icon: Smartphone, color: 'text-indigo-600',  bg: 'bg-indigo-50',  border: 'border-indigo-200', accent: '#4f46e5', gradFrom: 'from-indigo-500', gradTo: 'to-blue-600'   },
  { key: 'laptop',       label: 'Laptop Repair',    Icon: Laptop,     color: 'text-cyan-600',    bg: 'bg-cyan-50',    border: 'border-cyan-200',   accent: '#0891b2', gradFrom: 'from-cyan-500',   gradTo: 'to-teal-600'   },
  { key: 'car',          label: 'Car Service',      Icon: Car,        color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200',   accent: '#2563eb', gradFrom: 'from-blue-500',   gradTo: 'to-cyan-600'   },
  { key: 'bike',         label: 'Bike Repair',      Icon: Bike,       color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200',accent: '#059669', gradFrom: 'from-emerald-500',gradTo: 'to-teal-600'   },
  { key: 'electrical',   label: 'Electrical & AC',  Icon: Bolt,       color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',  accent: '#d97706', gradFrom: 'from-amber-500',  gradTo: 'to-yellow-600' },
  { key: 'plumbing',     label: 'Plumbing',         Icon: Droplets,   color: 'text-sky-600',     bg: 'bg-sky-50',     border: 'border-sky-200',    accent: '#0284c7', gradFrom: 'from-sky-500',    gradTo: 'to-blue-600'   },
  { key: 'carpentry',    label: 'Carpentry',        Icon: Hammer,     color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200', accent: '#ea580c', gradFrom: 'from-orange-500', gradTo: 'to-red-600'    },
  { key: 'cleaning',     label: 'Cleaning',         Icon: Sparkles,   color: 'text-teal-600',    bg: 'bg-teal-50',    border: 'border-teal-200',   accent: '#0d9488', gradFrom: 'from-teal-500',   gradTo: 'to-emerald-600'},
  { key: 'appliance',    label: 'Appliances',       Icon: Tv,         color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-200', accent: '#7c3aed', gradFrom: 'from-violet-500', gradTo: 'to-purple-600' },
  { key: 'helper',       label: 'Family & Elder',   Icon: Heart,      color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-200',   accent: '#e11d48', gradFrom: 'from-rose-500',   gradTo: 'to-pink-600'   },
  { key: 'pet',          label: 'Pet Care',         Icon: Dog,        color: 'text-yellow-600',  bg: 'bg-yellow-50',  border: 'border-yellow-200', accent: '#ca8a04', gradFrom: 'from-yellow-500', gradTo: 'to-amber-600' },
  { key: 'construction', label: 'Construction',     Icon: Wrench,     color: 'text-stone-600',   bg: 'bg-stone-50',   border: 'border-stone-200',  accent: '#78716c', gradFrom: 'from-stone-500',  gradTo: 'to-slate-600'  },
];

export const CAT_MAP = {
  mobile:       ['mobile'],
  laptop:       ['laptop'],
  car:          ['car'],
  bike:         ['bike'],
  electrical:   ['electrical', 'ac_repair'],
  plumbing:     ['plumbing'],
  carpentry:    ['carpentry', 'carpenter'],
  cleaning:     ['cleaning'],
  appliance:    ['appliance', 'appliances'],
  helper:       ['helper', 'family'],
  pet:          ['pet'],
  construction: ['construction'],
};

export const rupees = (p) => p != null ? Math.round(p / 100) : 0;
export const paise  = (r) => Math.round(Number(r) * 100);

export const SVC_ICONS = {
  electrical: Bolt, plumbing: Droplets, ac_repair: Wind,
  carpenter: Hammer, carpentry: Hammer, helper: Heart, cleaning: Sparkles,
  painting: Paintbrush2, screen_replacement: Smartphone,
  battery_replacement: Battery, charging_issue: Bolt,
  speaker_mic_issue: Wrench, software_issue: Wrench,
  water_damage_check: Droplets, mason: Home, puncture: Car,
  car_puncture: Car, bike_puncture: Bike,
  battery_jump_start: Bolt, fuel_delivery: Car, bike_wash: Bike,
  car_wash: Car, minor_roadside_repair: Car,
  laptop_screen_replacement: Laptop, laptop_battery_replacement: Battery,
  laptop_keyboard_repair: Laptop, laptop_thermal_service: Wind,
  periodic_car_service: Car, car_foam_wash_detailing: Car, car_ac_gas_refill: Wind,
  car_battery_replacement: Battery, bike_periodic_service: Bike,
};

export function SvcIcon({ code, className = '' }) {
  const Icon = SVC_ICONS[code] || Wrench;
  return <Icon size={14} strokeWidth={2} className={className} />;
}

export function NumInput({ value, onChange, step = '1', min = '0', max, prefix, className = '' }) {
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">{prefix}</span>
      )}
      <input
        type="number" value={value} onChange={onChange}
        step={step} min={min} max={max}
        className={`w-full border border-slate-200 rounded-xl text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none ${prefix ? 'pl-7 pr-3 py-2' : 'px-3 py-2'} ${className}`}
      />
    </div>
  );
}

export function FieldRow({ label, hint, children }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">{label}</label>
      {hint && <p className="text-[9px] text-slate-400 mb-1">{hint}</p>}
      {children}
    </div>
  );
}

export function InfoBox({ children, variant = 'blue' }) {
  const s = {
    blue:    'bg-blue-50 text-blue-700 ring-blue-100',
    violet:  'bg-violet-50 text-violet-700 ring-violet-100',
    stone:   'bg-stone-50 text-stone-700 ring-stone-100',
    amber:   'bg-amber-50 text-amber-700 ring-amber-100',
    cyan:    'bg-cyan-50 text-cyan-700 ring-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    rose:    'bg-rose-50 text-rose-700 ring-rose-100',
  };
  return <div className={`rounded-xl p-3 text-xs ring-1 space-y-1 ${s[variant]}`}>{children}</div>;
}
