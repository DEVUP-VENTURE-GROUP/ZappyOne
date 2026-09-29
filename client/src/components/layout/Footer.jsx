import { ShieldCheck } from 'lucide-react';
import { ZappyLogo } from '@shared/components/common/ZappyLogo';
import { PORTAL_URLS } from '@shared/config/portals';

/**
 * Site footer. Services and areas come from the live catalog and the active
 * zones, so it never lists a service we don't offer or a city we don't serve.
 * (Those links are also what search engines crawl — they must be true.)
 */

// Keep in sync with the Organization `sameAs` in index.html — Google links the brand to these.
const SOCIALS = [
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/zappyone/' },
  { label: 'Instagram', href: 'https://www.instagram.com/zappyone.india' },
  { label: 'Threads', href: 'https://www.threads.com/@zappyone.india' },
  { label: 'Play Store', href: 'https://play.google.com/store/apps/details?id=co.in.zappy' },
];

const HELP = [
  { label: 'Help & FAQs', href: '/faq' },
  { label: 'Privacy policy', href: '/policy/privacy-policy' },
  { label: 'Refund policy', href: '/policy/refund-policy' },
  { label: 'Warranty', href: '/policy/warranty-guidelines' },
  { label: 'support@zappyone.com', href: 'mailto:support@zappyone.com' },
];

// Each audience signs in on its own app; the customer site only links to them.
const PARTNERS = [
  { label: 'Become a Rakshak', href: PORTAL_URLS.rakshak },
  { label: 'List your shop', href: `${PORTAL_URLS.servicepro}/shop/login` },
  { label: 'Event partners', href: PORTAL_URLS.events },
  { label: 'partners@zappyone.com', href: 'mailto:partners@zappyone.com' },
];

function Column({ title, children }) {
  return (
    <div>
      <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

function Item({ href, children, external }) {
  return (
    <li>
      <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="text-[14px] text-slate-300 transition-colors hover:text-white">{children}</a>
    </li>
  );
}

export default function Footer({ services = [], areas = [] }) {
  const cities = [...new Set(areas.map((a) => a.city).filter(Boolean))];
  return (
    <footer className="bg-navy pb-24 pt-12 text-slate-300 sm:pb-12">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <a href="/" className="flex items-center gap-2">
              <ZappyLogo className="h-8 w-8 text-zappy-400" />
              <span className="text-[20px] font-bold text-white">ZappyOne</span>
            </a>
            <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-slate-400">
              Verified professionals near you — booked in a few taps, tracked live, priced before the work starts.
            </p>
            {cities.length > 0 && (
              <p className="mt-4 text-[13px] text-slate-400">
                Now serving <span className="font-semibold text-slate-200">{cities.join(', ')}</span>
              </p>
            )}
          </div>

          {services.length > 0 && (
            <Column title="Services">
              {services.slice(0, 10).map((s) => <Item key={s.code} href={s.path}>{s.name}</Item>)}
            </Column>
          )}
          <Column title="Help">{HELP.map((h) => <Item key={h.label} href={h.href}>{h.label}</Item>)}</Column>
          <Column title="Work with us">{PARTNERS.map((p) => <Item key={p.label} href={p.href} external={p.href.startsWith('http')}>{p.label}</Item>)}</Column>
        </div>

        {areas.length > 0 && (
          <div className="mt-10 border-t border-white/10 pt-6">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400">Areas we serve</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-slate-400">
              {areas.map((a) => <span key={`${a.city}:${a.name}`}>{a.name}{a.city ? `, ${a.city}` : ''}</span>)}
            </p>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-[12px] text-slate-500 md:flex-row">
          <p>© {new Date().getFullYear()} Zappy Technologies</p>
          <div className="flex flex-wrap items-center justify-center gap-5">
            {SOCIALS.map(({ label, href }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-white">{label}</a>
            ))}
          </div>
          <p className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-emerald-400" />
            A venture by{' '}
            <a href="https://www.devupecosystem.com/ecosystem/08a4fc9e-69da-42e3-b2c5-1863a87f1089" target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-300 hover:text-white">DevUp Ecosystem</a>
            {' · '}supported by{' '}
            <a href="https://startupsindia.in" target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-300 hover:text-white">Startups India</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
