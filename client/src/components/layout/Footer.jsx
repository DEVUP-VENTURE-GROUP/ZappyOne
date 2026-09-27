import { motion } from 'framer-motion';
import { Send, Heart, ShieldCheck, MapPin, Star, Phone, Zap } from 'lucide-react';
import { ZappyLogo } from '../common/ZappyLogo';
import { WORKER_URL, EVENTS_URL } from '../../config/hosts';

const SERVICES = [
  { label: 'Puncture Repair Near Me',       href: '/book/puncture' },
  { label: 'Phone Screen Repair',            href: '/book/screen_replacement' },
  { label: 'Laptop Repair at Home',          href: '/book/laptop_screen_issue' },
  { label: 'Bike Service at Home',           href: '/book/bike_service' },
  { label: 'Car Wash at Home',               href: '/book/car_wash' },
  { label: 'Battery Jump Start',             href: '/book/battery_jump_start' },
  { label: 'CCTV Installation',              href: '/book/cctv_install' },
  { label: 'Pet Grooming at Home',           href: '/book/pet_grooming' },
  { label: 'Birthday Decoration',            href: '/book/event_birthday_setup' },
  { label: 'Laptop Virus Removal',           href: '/book/laptop_virus_removal' },
  { label: 'Phone Battery Replacement',      href: '/book/battery_replacement' },
  { label: 'Car Breakdown Help',             href: '/book/car_breakdown' },
  { label: 'Fuel Delivery',                  href: '/book/fuel_delivery' },
  { label: 'Smart TV Installation',          href: '/book/smart_tv_install' },
  { label: 'Elder Care Assistant',           href: '/book/elder_companion' },
  { label: 'WiFi Router Setup',              href: '/book/router_setup' },
  { label: 'Laptop SSD Upgrade',            href: '/book/laptop_ssd_upgrade' },
  { label: 'Data Recovery',                  href: '/book/data_recovery' },
  { label: 'Hospital Companion',             href: '/book/hospital_companion' },
  { label: 'Wedding Decoration',             href: '/book/event_wedding_setup' },
];

const CITIES = [
  'Hyderabad', 'Bangalore', 'Mumbai', 'Delhi', 'Chennai',
  'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow',
  'Kochi', 'Coimbatore', 'Vizag', 'Nagpur', 'Indore',
  'Bhopal', 'Patna', 'Chandigarh', 'Surat', 'Vadodara',
];

// Keep in sync with the Organization `sameAs` array in index.html — Google uses
// the overlap between the two to associate the brand with these profiles.
const SOCIALS = [
  { label: 'LinkedIn',   href: 'https://www.linkedin.com/company/zappyone/' },
  { label: 'Instagram',  href: 'https://www.instagram.com/zappyone.india' },
  { label: 'Threads',    href: 'https://www.threads.com/@zappyone.india' },
  { label: 'Play Store', href: 'https://play.google.com/store/apps/details?id=co.in.zappy' },
];

const COMPANY = [
  { label: 'About Us',        href: '#' },
  { label: 'Careers',         href: '#' },
  { label: 'Help & FAQs',     href: '/faq' },
  { label: 'Trust & Safety',  href: '/faq' },
  { label: 'Privacy Policy',  href: '/policy/privacy-policy' },
  { label: 'Refund Policy',   href: '/policy/refund-policy' },
  { label: 'Warranty',        href: '/policy/warranty-guidelines' },
];

// The consumer site never exposes a worker/partner LOGIN — each audience has its
// own front door (rakshak. / events.), the way Zomato and Zepto keep the eater app
// free of rider/restaurant sign-in. These are marketing links to those apps, not
// login routes: `/worker/login` on zappyone.com would authenticate a worker on the
// consumer origin, which the host router then bounces back out of anyway.
const PARTNERS = [
  { label: 'Join as a Worker',     href: WORKER_URL,  external: true },
  { label: 'Earn ₹500–₹2000/day', href: WORKER_URL,  external: true },
  { label: 'Event Partner Portal', href: EVENTS_URL,  external: true },
  { label: 'Advertise with Zappy', href: '#' },
  { label: 'Partner Guidelines',   href: '#' },
];

export default function Footer() {
  return (
    <footer className="relative bg-slate-900 pt-16 pb-28 overflow-hidden mt-12 rounded-t-[2.5rem] md:rounded-t-[4rem] border-t border-slate-800">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-64 bg-indigo-600 blur-[120px] opacity-10 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">

        {/* ── Brand row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-14">

          {/* Brand */}
          <div className="lg:col-span-1">
            <a href="/" className="flex items-center gap-2 mb-5 no-underline">
              <ZappyLogo className="w-9 h-9 text-indigo-400" />
              <span className="text-2xl font-black text-white tracking-tight">Zappy</span>
            </a>
            <p className="text-slate-400 text-sm leading-relaxed mb-4 max-w-xs">
              India's fastest on-demand home services platform. Book verified professionals in 60 seconds — puncture repair, phone repair, laptop repair, electrician, plumber and 100+ services across India.
            </p>

            <div className="space-y-1.5 mb-6 text-xs text-slate-400">
              <p><strong className="text-slate-200">General:</strong> <a href="mailto:contact@zappyone.com" className="text-indigo-400 hover:underline">contact@zappyone.com</a></p>
              <p><strong className="text-slate-200">Support:</strong> <a href="mailto:support@zappyone.com" className="text-indigo-400 hover:underline">support@zappyone.com</a></p>
              <p><strong className="text-slate-200">Partners:</strong> <a href="mailto:partners@zappyone.com" className="text-indigo-400 hover:underline">partners@zappyone.com</a></p>
              <p><strong className="text-slate-200">Vendors:</strong> <a href="mailto:vendors@zappyone.com" className="text-indigo-400 hover:underline">vendors@zappyone.com</a></p>
            </div>

            <div className="flex flex-col gap-2 text-xs text-slate-500">
              <div className="flex items-center gap-2"><Star size={11} className="text-amber-400 fill-amber-400" /><span>4.8 ★ rated by 5,000+ customers</span></div>
              <div className="flex items-center gap-2"><ShieldCheck size={11} className="text-emerald-400" /><span>Background-verified professionals</span></div>
              <div className="flex items-center gap-2"><Zap size={11} className="text-indigo-400" /><span>Arrives in 15–30 minutes</span></div>
              <div className="flex items-center gap-2"><MapPin size={11} className="text-rose-400" /><span>Live GPS tracking</span></div>
            </div>
          </div>

          {/* Partners & Company */}
          <div>
            <p className="text-white font-bold mb-5 text-sm uppercase tracking-widest">Partners</p>
            <ul className="space-y-3">
              {PARTNERS.map(({ label, href, external }) => (
                <li key={label}>
                  <a
                    href={href}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="text-sm text-slate-400 hover:text-indigo-400 transition-colors"
                  >{label}</a>
                </li>
              ))}
            </ul>
            <p className="text-white font-bold mt-8 mb-5 text-sm uppercase tracking-widest">Company</p>
            <ul className="space-y-3">
              {COMPANY.map(({ label, href }) => (
                <li key={label}>
                  <a href={href} className="text-sm text-slate-400 hover:text-indigo-400 transition-colors">{label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Popular services */}
          <div>
            <p className="text-white font-bold mb-5 text-sm uppercase tracking-widest">Popular Services</p>
            <ul className="space-y-2.5">
              {SERVICES.map(({ label, href }) => (
                <li key={href}>
                  <a href={href} className="text-sm text-slate-400 hover:text-indigo-400 transition-colors leading-tight block">{label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Cities & newsletter */}
          <div>
            <p className="text-white font-bold mb-5 text-sm uppercase tracking-widest">We Serve</p>
            <div className="flex flex-wrap gap-2 mb-8">
              {CITIES.map(city => (
                <span
                  key={city}
                  className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700 hover:border-indigo-500/50 hover:text-indigo-400 transition-colors cursor-default"
                >
                  {city}
                </span>
              ))}
            </div>

            <p className="text-white font-bold mb-4 text-sm uppercase tracking-widest">Stay Updated</p>
            <div className="flex items-center p-1.5 bg-slate-800/50 border border-slate-700 rounded-2xl focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all">
              <input
                type="email"
                placeholder="your@email.com"
                className="bg-transparent border-none outline-none text-sm text-slate-300 px-3 w-full placeholder-slate-500"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-9 h-9 shrink-0 bg-indigo-600 hover:bg-indigo-500 rounded-xl flex items-center justify-center text-white transition-colors"
              >
                <Send size={14} />
              </motion.button>
            </div>
          </div>
        </div>

        {/* ── Service × City keyword grid (crawlable, subtle) ──────────── */}
        <div className="border-t border-slate-800 pt-10 mb-10">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-5">Services Near You</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {[
              ['Puncture repair Hyderabad', '/book/puncture'],
              ['Puncture repair Bangalore', '/book/puncture'],
              ['Phone repair near me', '/book/screen_replacement'],
              ['Laptop repair Hyderabad', '/book/laptop_slow'],
              ['Bike service near me', '/book/bike_service'],
              ['Car wash home Bangalore', '/book/car_wash'],
              ['Birthday decoration Mumbai', '/book/event_birthday_setup'],
              ['CCTV installation near me', '/book/cctv_install'],
              ['Pet grooming at home', '/book/pet_grooming'],
              ['Electrician near me', '/book/puncture'],
              ['Dog walking near me', '/book/pet_walking'],
              ['Smart TV setup near me', '/book/smart_tv_install'],
              ['Laptop SSD upgrade near me', '/book/laptop_ssd_upgrade'],
              ['Car breakdown help near me', '/book/car_breakdown'],
              ['Elder care near me', '/book/elder_companion'],
              ['Medicine pickup near me', '/book/medicine_pickup'],
              ['Wedding decorator near me', '/book/event_wedding_setup'],
              ['WiFi setup near me', '/book/router_setup'],
              ['Data recovery near me', '/book/data_recovery'],
              ['Fuel delivery near me', '/book/fuel_delivery'],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* ── Bottom bar ───────────────────────────────────────────────── */}
        <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-5">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} Zappy Technologies. All rights reserved.
          </p>

          {/* Real profiles only. These double as SEO signals: they must match the
              Organization `sameAs` in index.html for Google to link the brand to
              its socials. The old Twitter/Facebook handles were unverified and the
              Instagram one was wrong (the real account is @zappyone.india). */}
          <div className="flex items-center gap-5">
            {SOCIALS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-white transition-colors text-xs font-bold"
              >{label}</a>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <ShieldCheck size={13} className="text-emerald-500" />
            <span>100% Secure · Verified Professionals · Live Tracking</span>
          </div>
        </div>

        {/* Backing — real credibility signal for visitors, and the outbound links
            corroborate the `parentOrganization` / `funder` claims in the schema. */}
        <div className="border-t border-slate-800 mt-6 pt-6 flex flex-col sm:flex-row items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>A venture by</span>
          <a
            href="https://www.devupecosystem.com/ecosystem/08a4fc9e-69da-42e3-b2c5-1863a87f1089"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-slate-300 hover:text-white transition-colors"
          >DevUp Ecosystem</a>
          <span className="hidden sm:inline text-slate-700">·</span>
          <span>Supported by</span>
          <a
            href="https://startupsindia.in"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-slate-300 hover:text-white transition-colors"
          >Startups India</a>
        </div>
      </div>
    </footer>
  );
}
