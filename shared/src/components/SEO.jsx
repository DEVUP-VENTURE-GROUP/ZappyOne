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
    setMeta('og:site_name', 'Zappy', true);
    setMeta('og:locale', 'en_IN', true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title || document.title);
    setMeta('twitter:description', description);
    setMeta('twitter:image', ogImage || `${BASE_URL}/og-default.jpg`);
    setMeta('twitter:site', '@zappyone');
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

/* ─── Service metadata map ────────────────────────────────────────────────── */
export const SERVICE_META = {
  // Vehicle
  puncture:           { name: 'Puncture Repair', desc: 'Doorstep tyre puncture repair for bike and car. Mechanic arrives in 30 minutes with all tools. Bike puncture from ₹150, car puncture from ₹250.', min: 150, max: 500, keywords: 'puncture repair near me, tyre puncture repair at home, bike puncture repair, car tyre puncture, doorstep puncture repair' },
  car_puncture:       { name: 'Car Puncture Repair', desc: 'Car tyre puncture repair at your location. All car brands. Arrives in 30 minutes. Starting from ₹250.', min: 250, max: 500, keywords: 'car puncture repair near me, car tyre puncture repair at home, tyre repair service' },
  bike_service:       { name: 'Bike Service at Home', desc: 'Complete bike service at your doorstep. All brands — Hero, Honda, Bajaj, TVS, Royal Enfield, KTM, Yamaha. Chain, brakes, oil change, tuning.', min: 400, max: 1500, keywords: 'bike service at home near me, doorstep bike service, two wheeler service at home' },
  bike_chain_issue:   { name: 'Bike Chain Repair', desc: 'Bike chain adjustment, replacement, or repair at your home. Fast service for all bike brands.', min: 150, max: 500, keywords: 'bike chain repair at home, bike chain replacement near me' },
  bike_brake_issue:   { name: 'Bike Brake Repair', desc: 'Bike brake adjustment and repair at home. Front and rear brakes, brake pads replacement.', min: 150, max: 400, keywords: 'bike brake repair near me, bike brake adjustment at home' },
  bike_battery_issue: { name: 'Bike Battery Replacement', desc: 'Two-wheeler battery replacement at home. All bike brands, genuine batteries, instant service.', min: 300, max: 1500, keywords: 'bike battery replacement near me, two wheeler battery at home' },
  bike_wash:          { name: 'Bike Wash at Home', desc: 'Professional bike wash at your doorstep. Foam wash, chain cleaning, mirror polish. All bike brands.', min: 200, max: 600, keywords: 'bike wash at home near me, doorstep bike cleaning' },
  car_wash:           { name: 'Car Wash at Home', desc: 'Doorstep car wash and car detailing. Foam wash, interior cleaning, steam clean. All car brands from ₹300.', min: 300, max: 2500, keywords: 'car wash at home near me, doorstep car wash, car detailing at home' },
  car_detailing:      { name: 'Car Detailing at Home', desc: 'Professional car detailing at your doorstep. Deep cleaning, wax polish, ceramic coating, steam wash.', min: 1500, max: 8000, keywords: 'car detailing at home near me, car polishing at home, car deep cleaning service' },
  battery_jump_start: { name: 'Battery Jump Start', desc: 'Car battery jump start service at your location. Dead battery? We restart your vehicle in 30 minutes. 24/7 available.', min: 300, max: 700, keywords: 'battery jump start near me, car battery dead help, car won\'t start service' },
  car_breakdown:      { name: 'Car Breakdown Assistance', desc: 'Emergency car breakdown help at your location. Towing, mechanic on-site, quick diagnosis. Available 24/7.', min: 500, max: 3000, keywords: 'car breakdown help near me, car breakdown service, roadside assistance India' },
  bike_breakdown:     { name: 'Bike Breakdown Assistance', desc: 'Emergency bike breakdown help. Mechanic dispatched immediately to your location. Any brand, any issue.', min: 300, max: 1500, keywords: 'bike breakdown help near me, two wheeler breakdown service' },
  fuel_delivery:      { name: 'Fuel Delivery Service', desc: 'Emergency fuel delivery to your location. Out of petrol? We deliver petrol/diesel to you within 30 minutes.', min: 200, max: 500, keywords: 'fuel delivery near me, emergency petrol delivery, out of fuel service' },
  // Mobile
  screen_replacement: { name: 'Phone Screen Replacement at Home', desc: 'Mobile screen replacement at your doorstep. All brands: iPhone, Samsung, OnePlus, Realme, Oppo, Vivo, Xiaomi. Genuine parts.', min: 800, max: 8000, keywords: 'phone screen replacement near me, mobile screen repair at home, iPhone screen repair, Samsung screen replacement' },
  battery_replacement:{ name: 'Phone Battery Replacement', desc: 'Mobile battery replacement at home. All brands, genuine batteries, 30-minute service. Bike puncture from ₹150.', min: 400, max: 3000, keywords: 'phone battery replacement near me, mobile battery change at home' },
  charging_issue:     { name: 'Phone Charging Issue Repair', desc: 'Mobile phone not charging? Our technician fixes charging port, charging IC, or USB issue at your home.', min: 300, max: 2000, keywords: 'phone charging issue repair near me, mobile not charging fix at home' },
  water_damage:       { name: 'Water Damaged Phone Repair', desc: 'Dropped phone in water? Our technicians repair water-damaged phones at home. All brands.', min: 500, max: 5000, keywords: 'water damaged phone repair near me, phone fell in water repair' },
  software_issue:     { name: 'Phone Software Issue Fix', desc: 'Phone hanging, restarting, or not responding? Our technician fixes software issues, flashing, unlocking at home.', min: 300, max: 1500, keywords: 'phone software issue repair near me, mobile software fix at home' },
  data_recovery:      { name: 'Phone Data Recovery', desc: 'Lost data from your phone? We recover photos, contacts, messages, documents. All brands at home.', min: 500, max: 4000, keywords: 'phone data recovery near me, mobile data recovery service at home' },
  // Laptop
  laptop_screen_issue:{ name: 'Laptop Screen Repair at Home', desc: 'Laptop screen replacement at your home. Cracked, flickering, or dead display. All brands: Dell, HP, Lenovo, Apple, Asus, Acer.', min: 2000, max: 12000, keywords: 'laptop screen repair near me, laptop screen replacement at home, broken laptop screen fix' },
  laptop_slow:        { name: 'Slow Laptop Fix at Home', desc: 'Laptop running slow? Our technician diagnoses and fixes slow performance, hanging, overheating at your home.', min: 500, max: 3000, keywords: 'slow laptop fix near me, laptop hanging repair at home, laptop speed up service' },
  laptop_ssd_upgrade: { name: 'Laptop SSD Upgrade at Home', desc: 'Upgrade your laptop HDD to SSD at home. 3x faster boot time. All brands and SSD capacities: 256GB, 512GB, 1TB.', min: 2000, max: 8000, keywords: 'laptop SSD upgrade near me, laptop hard drive replacement at home, HDD to SSD upgrade' },
  laptop_ram_upgrade: { name: 'Laptop RAM Upgrade at Home', desc: 'Upgrade your laptop RAM at home. 4GB to 8GB to 16GB. Compatible RAM for all laptop brands.', min: 1500, max: 6000, keywords: 'laptop RAM upgrade near me, laptop memory upgrade at home' },
  laptop_virus_removal:{ name: 'Laptop Virus Removal at Home', desc: 'Virus, malware, ransomware removal from your laptop at home. Deep cleaning, antivirus install, Windows repair.', min: 500, max: 2000, keywords: 'laptop virus removal near me, malware removal service at home, laptop antivirus fix' },
  laptop_data_recovery:{ name: 'Laptop Data Recovery', desc: 'Recover lost files, photos, documents from laptop hard drive. Dead hard drive, formatted drive, accidental delete.', min: 1000, max: 8000, keywords: 'laptop data recovery near me, hard drive data recovery service' },
  laptop_charging_issue:{ name: 'Laptop Charging Issue Repair', desc: 'Laptop not charging? Repair charging port, adapter pin, or charging IC at your home.', min: 500, max: 3000, keywords: 'laptop not charging repair near me, laptop charging port fix at home' },
  laptop_keyboard_issue:{ name: 'Laptop Keyboard Repair', desc: 'Laptop keyboard not working? Keys stuck or broken? We repair or replace laptop keyboards at home.', min: 800, max: 4000, keywords: 'laptop keyboard repair near me, laptop keyboard replacement at home' },
  // Smart devices
  cctv_install:       { name: 'CCTV Camera Installation', desc: 'Professional CCTV camera installation at home or office. All brands: CP Plus, Hikvision, Dahua. Same-day service.', min: 1500, max: 8000, keywords: 'CCTV camera installation near me, security camera installation at home, CCTV installation service' },
  cctv_repair:        { name: 'CCTV Camera Repair', desc: 'CCTV camera not working? We repair all brands at your home. Blurry image, no recording, offline camera.', min: 500, max: 3000, keywords: 'CCTV camera repair near me, security camera not working fix' },
  smart_tv_install:   { name: 'Smart TV Installation', desc: 'Smart TV wall mounting and installation at home. All brands: Samsung, LG, Sony, Mi, Vu. HDMI setup, apps install.', min: 500, max: 2000, keywords: 'smart TV installation near me, TV wall mounting service, smart TV setup at home' },
  router_setup:       { name: 'WiFi Router Setup', desc: 'WiFi router setup and configuration at home. Slow WiFi, dead zones, password issues. All brands.', min: 300, max: 1000, keywords: 'WiFi router setup near me, internet router configuration at home, WiFi setup service' },
  // Pet
  pet_grooming:       { name: 'Pet Grooming at Home', desc: 'Professional pet grooming at your doorstep. Bath, haircut, nail trim, ear cleaning for dogs and cats. All breeds.', min: 500, max: 3000, keywords: 'pet grooming at home near me, dog grooming at home, cat grooming service' },
  pet_walking:        { name: 'Dog Walking Service', desc: 'Professional dog walking near you. 30-minute and 60-minute walks. All breeds. Daily or weekly schedule.', min: 150, max: 500, keywords: 'dog walking service near me, dog walker at home, professional dog walking' },
  // Events
  event_birthday_setup:{ name: 'Birthday Decoration at Home', desc: 'Professional birthday party decoration at your home. Balloons, LED lights, banners, theme setup, backdrop. Book 2 hours ahead.', min: 1500, max: 8000, keywords: 'birthday decoration at home near me, birthday party decoration service, balloon decoration near me' },
  event_wedding_setup: { name: 'Wedding Decoration Service', desc: 'Wedding venue decoration at home or hall. Floral arrangements, backdrop, stage setup, entrance decoration.', min: 10000, max: 80000, keywords: 'wedding decoration near me, wedding decorator at home, wedding venue decoration service' },
  event_decorator:     { name: 'Event Decoration Service', desc: 'Professional event decoration for any occasion. Anniversary, housewarming, baby shower, corporate events.', min: 2000, max: 20000, keywords: 'event decoration near me, event decorator at home, party decoration service' },
  // Family assist
  medicine_pickup:    { name: 'Medicine Pickup Service', desc: 'Doorstep medicine delivery from pharmacy. Our helper picks up prescription medicines and delivers to your home.', min: 50, max: 200, keywords: 'medicine pickup near me, pharmacy delivery at home, medicine delivery service' },
  hospital_companion: { name: 'Hospital Companion Service', desc: 'Trusted hospital companion for elderly or patients. Our helper accompanies to hospital, manages paperwork, stays by their side.', min: 500, max: 2000, keywords: 'hospital companion near me, patient attendant service, hospital helper' },
  elder_companion:    { name: 'Elder Care Assistant', desc: 'Dedicated companion for senior citizens. Our trained helpers assist with daily activities, medicines, doctor visits.', min: 300, max: 1500, keywords: 'elder care at home near me, senior citizen helper, old age care service' },
};

/* ─── Build service-specific JSON-LD ──────────────────────────────────────── */
export function buildServiceJsonLd(serviceKey, city = null) {
  const m = SERVICE_META[serviceKey];
  if (!m) return [];
  const cityStr = city ? ` in ${city}` : ' near me';
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: m.name,
      description: m.desc,
      url: `${BASE_URL}/book/${serviceKey}`,
      provider: {
        '@type': 'Organization',
        '@id': `${BASE_URL}/#organization`,
        name: 'Zappy',
      },
      areaServed: city
        ? { '@type': 'City', name: city, containedInPlace: { '@type': 'Country', name: 'India' } }
        : { '@type': 'Country', name: 'India' },
      availableChannel: {
        '@type': 'ServiceChannel',
        serviceUrl: `${BASE_URL}/book/${serviceKey}`,
        serviceType: 'On-demand doorstep service',
        availableLanguage: ['English', 'Hindi', 'Telugu'],
      },
      ...(m.min != null && {
        offers: {
          '@type': 'Offer',
          priceCurrency: 'INR',
          priceSpecification: {
            '@type': 'PriceSpecification',
            minPrice: m.min,
            maxPrice: m.max,
            priceCurrency: 'INR',
          },
          seller: { '@id': `${BASE_URL}/#organization` },
        },
      }),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
        { '@type': 'ListItem', position: 2, name: m.name, item: `${BASE_URL}/book/${serviceKey}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: `How much does ${m.name.toLowerCase()} cost${cityStr}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: m.min
              ? `${m.name} on Zappy starts from ₹${m.min}${m.max ? ` and goes up to ₹${m.max}` : ''}. The exact price depends on your location and specific requirements. You get a transparent quote before confirming.`
              : `Get an instant price quote for ${m.name.toLowerCase()} on Zappy. Price shown before you confirm — no hidden charges.`,
          },
        },
        {
          '@type': 'Question',
          name: `How fast does a ${m.name.toLowerCase()} professional arrive?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `After booking ${m.name.toLowerCase()} on Zappy, a verified professional typically arrives at your doorstep within 15–30 minutes. You can track them live on the map.`,
          },
        },
        {
          '@type': 'Question',
          name: `Is Zappy ${m.name.toLowerCase()} available 24/7?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Zappy's ${m.name.toLowerCase()} service is available across India. Availability depends on your location and time. Emergency bookings are prioritized for immediate dispatch.`,
          },
        },
      ],
    },
  ];
}

/* ─── Pre-built schemas for static pages ─────────────────────────────────── */
export const HOME_SCHEMA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${BASE_URL}/#webpage`,
    name: 'Zappy — Instant Home Services India',
    url: BASE_URL,
    description: 'Book verified professionals instantly for 100+ home services across India. Arrive in 30 minutes.',
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
    name: 'Zappy Premium Plans — Surge Protection, Cashback & Priority Booking',
    url: `${BASE_URL}/plans`,
    description: 'Upgrade to Zappy Premium for zero surge pricing, higher cashback, zero platform fees, and priority worker assignment.',
    inLanguage: 'en-IN',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Zappy Subscription Plans',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Zappy Free', description: 'Basic access to all Zappy services with standard pricing and 5% wallet cashback.' },
      { '@type': 'ListItem', position: 2, name: 'Zappy Gold', description: 'Priority booking, higher cashback, reduced platform fees, surge cap protection.' },
      { '@type': 'ListItem', position: 3, name: 'Zappy Platinum', description: 'No surge pricing ever, zero platform fees, maximum cashback, express dispatch.' },
    ],
  },
];

export const LOGIN_SCHEMA = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Login to Zappy — Book Home Services Instantly',
    url: `${BASE_URL}/login`,
    description: 'Login to Zappy with your phone number. Get OTP via call and start booking home services instantly.',
    inLanguage: 'en-IN',
  },
];
