import { useEffect } from 'react';

export const BASE_URL = 'https://www.zappyone.com';

function setMeta(name, content, prop = false) {
  if (!content) return;
  const attr = prop ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel, href, extra = {}) {
  if (!href) return;
  const key = extra.hreflang ? `link[rel="${rel}"][hreflang="${extra.hreflang}"]` : `link[rel="${rel}"]`;
  let el = document.querySelector(key);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    if (extra.hreflang) el.setAttribute('hreflang', extra.hreflang);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setJsonLd(id, data) {
  let el = document.querySelector(`script[data-seo="${id}"]`);
  if (!el) {
    el = document.createElement('script');
    el.setAttribute('type', 'application/ld+json');
    el.setAttribute('data-seo', id);
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function removeJsonLd(id) {
  const el = document.querySelector(`script[data-seo="${id}"]`);
  if (el) el.remove();
}

export default function SEO({
  title,
  description,
  canonical,
  ogImage,
  ogType = 'website',
  noIndex = false,
  jsonLd,
  keywords,
  city,
}) {
  useEffect(() => {
    const prevTitle = document.title;

    if (title) document.title = title;

    setMeta('description', description);
    setMeta('keywords', keywords);
    setMeta('og:title', title || document.title, true);
    setMeta('og:description', description, true);
    setMeta('og:type', ogType, true);
    setMeta('og:url', canonical, true);
    setMeta('og:image', ogImage || `${BASE_URL}/og-default.jpg`, true);
    setMeta('og:image:width', '1200', true);
    setMeta('og:image:height', '630', true);
    setMeta('og:site_name', 'ZappyOne', true);
    setMeta('og:locale', 'en_IN', true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title || document.title);
    setMeta('twitter:description', description);
    setMeta('twitter:image', ogImage || `${BASE_URL}/og-default.jpg`);
    setMeta('robots', noIndex ? 'noindex,nofollow' : 'index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1');

    if (city) {
      setMeta('geo.placename', city);
      setMeta('geo.region', 'IN');
    }

    setLink('canonical', canonical);
    setLink('alternate', canonical, { hreflang: 'en-in' });
    setLink('alternate', canonical, { hreflang: 'x-default' });

    const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
    schemas.forEach((schema, i) => setJsonLd(`page-${i}`, schema));

    return () => {
      document.title = prevTitle;
      schemas.forEach((_, i) => removeJsonLd(`page-${i}`));
    };
  }, [title, description, canonical, ogImage, ogType, noIndex, jsonLd, keywords, city]);

  return null;
}

/* Pre-built schemas for static pages */
export const HOME_SCHEMA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${BASE_URL}/#webpage`,
    name: 'ZappyOne - Instant Home Services India',
    url: BASE_URL,
    description: 'Book verified professionals at your door, with the price shown before you book and live tracking. Live in Hyderabad, launching across India.',
    isPartOf: { '@id': `${BASE_URL}/#website` },
    about: { '@id': `${BASE_URL}/#organization` },
    inLanguage: 'en-IN',
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL }],
    },
  },
];

export const PLANS_SCHEMA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'ZappyOne Premium Plans - Surge Protection, Cashback & Priority Booking',
    url: `${BASE_URL}/plans`,
    description: 'Upgrade to ZappyOne Premium for zero surge pricing, higher cashback, zero platform fees, and priority worker assignment.',
    inLanguage: 'en-IN',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'ZappyOne Subscription Plans',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ZappyOne Free', description: 'Basic access to all ZappyOne services with standard pricing and 5% wallet cashback.' },
      { '@type': 'ListItem', position: 2, name: 'ZappyOne Gold', description: 'Priority booking, higher cashback, reduced platform fees, surge cap protection.' },
      { '@type': 'ListItem', position: 3, name: 'ZappyOne Platinum', description: 'No surge pricing ever, zero platform fees, maximum cashback, express dispatch.' },
    ],
  },
];

export const LOGIN_SCHEMA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Login to ZappyOne - Book Home Services Instantly',
    url: `${BASE_URL}/login`,
    description: 'Login to ZappyOne with your phone number. Get OTP via call and start booking home services instantly.',
    inLanguage: 'en-IN',
  },
];
