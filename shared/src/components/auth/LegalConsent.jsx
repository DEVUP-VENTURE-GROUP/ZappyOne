import { PORTAL_URLS } from '../../config/portals';

/**
 * "By continuing you agree to…" under every web sign-in, linking the pages
 * admin publishes (Admin → Content → Legal pages). Customers agree to the
 * Terms of Use, providers to the Partner Terms; both to the Privacy Policy.
 * The pages live on the customer website, so the portals link there.
 */
export default function LegalConsent({ audience = 'customer', className = '' }) {
  const base = audience === 'customer' ? '' : PORTAL_URLS.customer;
  const link = 'font-semibold text-zappy-600 hover:underline';
  const out = audience === 'customer' ? {} : { target: '_blank', rel: 'noreferrer' };
  return (
    <p className={`text-center text-[12px] leading-relaxed text-slate-500 ${className}`}>
      By continuing, you agree to ZappyOne&apos;s{' '}
      <a href={`${base}/policy/${audience === 'customer' ? 'terms' : 'partner-terms'}`} className={link} {...out}>{audience === 'customer' ? 'Terms of Use' : 'Partner Terms'}</a>
      {' '}and{' '}
      <a href={`${base}/policy/privacy-policy`} className={link} {...out}>Privacy Policy</a>.
    </p>
  );
}
