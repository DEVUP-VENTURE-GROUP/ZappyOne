/**
 * HTML template engine for SEO landing pages.
 * Server-rendered — no React dependency.
 * Inline critical CSS for fast LCP. System fonts only (no render-blocking).
 * Each page includes full Schema.org JSON-LD in <head>.
 */
const s = require('./schema');

const CRITICAL_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;background:#fff;line-height:1.6}
a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px}
/* NAV */
nav{background:#fff;border-bottom:1px solid #e2e8f0;padding:14px 0;position:sticky;top:0;z-index:100}
nav .inner{display:flex;align-items:center;justify-content:space-between}
.logo{font-weight:800;font-size:22px;color:#2563eb;display:flex;align-items:center;gap:6px}
.logo-dot{width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block}
.nav-cta{background:#2563eb;color:#fff;padding:10px 20px;border-radius:10px;font-weight:600;font-size:14px}
.nav-cta:hover{background:#1d4ed8;text-decoration:none}
/* HERO */
.hero{background:linear-gradient(135deg,#eff6ff 0%,#f0fdf4 100%);padding:60px 0 50px;border-bottom:1px solid #e2e8f0}
.hero-badge{display:inline-flex;align-items:center;gap:6px;background:#dcfce7;color:#15803d;border:1px solid #86efac;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;margin-bottom:16px}
.hero h1{font-size:clamp(26px,4vw,42px);font-weight:800;color:#0f172a;line-height:1.2;margin-bottom:16px}
.hero p{font-size:17px;color:#475569;max-width:600px;margin-bottom:28px;line-height:1.7}
.hero-actions{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.btn-primary{background:#2563eb;color:#fff;padding:14px 28px;border-radius:14px;font-weight:700;font-size:16px;display:inline-flex;align-items:center;gap:8px;transition:background .15s}
.btn-primary:hover{background:#1d4ed8;text-decoration:none}
.btn-secondary{background:#fff;color:#2563eb;border:2px solid #bfdbfe;padding:13px 24px;border-radius:14px;font-weight:600;font-size:15px}
.btn-secondary:hover{background:#eff6ff;text-decoration:none}
/* STATS */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;padding:32px 0;border-bottom:1px solid #f1f5f9}
.stat{text-align:center;padding:20px 16px;background:#f8fafc;border-radius:16px}
.stat-num{font-size:28px;font-weight:800;color:#2563eb}
.stat-label{font-size:13px;color:#64748b;margin-top:4px;font-weight:500}
/* FEATURES */
.section{padding:52px 0}
.section-title{font-size:26px;font-weight:800;color:#0f172a;margin-bottom:8px}
.section-sub{color:#64748b;font-size:15px;margin-bottom:32px}
.features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
.feat-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;display:flex;align-items:flex-start;gap:12px}
.feat-icon{width:36px;height:36px;background:#dbeafe;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.feat-text{font-weight:600;font-size:14px;color:#334155}
/* HOW IT WORKS */
.how-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px;margin-top:32px}
.how-step{position:relative;padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:20px}
.step-num{width:36px;height:36px;background:#2563eb;color:#fff;border-radius:50%;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.step-name{font-weight:700;font-size:15px;margin-bottom:8px;color:#0f172a}
.step-text{font-size:14px;color:#64748b;line-height:1.6}
/* AREAS */
.area-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
.area-chip{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:8px 14px;font-size:13px;color:#334155;font-weight:500;transition:all .15s}
.area-chip:hover{background:#dbeafe;border-color:#93c5fd;text-decoration:none;color:#1d4ed8}
/* CATEGORIES */
.cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-top:24px}
.cat-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px 16px;text-align:center;transition:all .15s}
.cat-card:hover{border-color:#93c5fd;box-shadow:0 4px 14px rgba(37,99,235,.08);text-decoration:none;transform:translateY(-2px)}
.cat-emoji{font-size:28px;margin-bottom:10px;display:block}
.cat-name{font-size:13px;font-weight:600;color:#334155}
/* FAQ */
.faq-list{display:flex;flex-direction:column;gap:12px;margin-top:24px}
.faq-item{border:1px solid #e2e8f0;border-radius:16px;overflow:hidden}
.faq-q{padding:18px 20px;font-weight:600;font-size:15px;color:#0f172a;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:#fff}
.faq-q:hover{background:#f8fafc}
.faq-a{padding:0 20px 18px;font-size:14px;color:#475569;line-height:1.7}
/* TRUST */
.trust-bar{background:#0f172a;padding:28px 0}
.trust-inner{display:flex;justify-content:center;flex-wrap:wrap;gap:32px}
.trust-item{display:flex;align-items:center;gap:8px;color:#e2e8f0;font-size:14px;font-weight:500}
.trust-icon{font-size:20px}
/* CTA BANNER */
.cta-banner{background:linear-gradient(135deg,#1e40af,#7c3aed);padding:60px 0;text-align:center;color:#fff}
.cta-banner h2{font-size:clamp(22px,3vw,34px);font-weight:800;margin-bottom:12px}
.cta-banner p{font-size:16px;opacity:.85;margin-bottom:28px}
.btn-white{background:#fff;color:#1e40af;padding:15px 32px;border-radius:14px;font-weight:700;font-size:16px}
.btn-white:hover{background:#f0f9ff;text-decoration:none}
/* BREADCRUMB */
.breadcrumb{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:14px 0;font-size:13px;color:#64748b}
.breadcrumb a{color:#64748b}.breadcrumb a:hover{color:#2563eb}
.bc-sep{color:#cbd5e1}
/* FOOTER */
footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:40px 0;font-size:13px;color:#64748b}
.footer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px}
.footer-col h4{font-weight:700;color:#334155;margin-bottom:12px;font-size:14px}
.footer-col a{display:block;color:#64748b;margin-bottom:6px;font-size:13px}
.footer-col a:hover{color:#2563eb}
.footer-bottom{margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
@media(max-width:600px){.hero{padding:40px 0 36px}.hero h1{font-size:26px}.btn-primary,.btn-secondary{width:100%;justify-content:center}.stats{grid-template-columns:repeat(2,1fr)}.footer-bottom{flex-direction:column;text-align:center}}
`;

function nav(baseUrl) {
  return `<nav><div class="wrap"><div class="inner">
    <a href="${baseUrl}" class="logo"><span>⚡</span> Zappy <span class="logo-dot"></span></a>
    <a href="${baseUrl}" class="nav-cta">Book Now →</a>
  </div></div></nav>`;
}

function breadcrumb(crumbs) {
  const items = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1;
    return isLast
      ? `<span>${c.name}</span>`
      : `<a href="${c.url}">${c.name}</a><span class="bc-sep">/</span>`;
  });
  return `<div class="wrap"><nav class="breadcrumb" aria-label="Breadcrumb">${items.join('')}</nav></div>`;
}

function trustBar() {
  return `<div class="trust-bar"><div class="wrap"><div class="trust-inner">
    <div class="trust-item"><span class="trust-icon">✅</span> Verified Professionals</div>
    <div class="trust-item"><span class="trust-icon">⚡</span> 15-Min Response</div>
    <div class="trust-item"><span class="trust-icon">🔒</span> Secure Payments</div>
    <div class="trust-item"><span class="trust-icon">⭐</span> 4.7★ Rated</div>
    <div class="trust-item"><span class="trust-icon">🛡️</span> Service Warranty</div>
  </div></div></div>`;
}

function faqSection(faqs) {
  const items = faqs.map(({ q, a }, i) => `
    <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
      <div class="faq-q" onclick="const a=this.nextElementSibling;a.style.display=a.style.display==='none'||!a.style.display?'block':'none'">
        <span itemprop="name">${q}</span><span>▾</span>
      </div>
      <div class="faq-a" style="display:${i === 0 ? 'block' : 'none'}" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <span itemprop="text">${a}</span>
      </div>
    </div>`).join('');
  return `<div class="faq-list" itemscope itemtype="https://schema.org/FAQPage">${items}</div>`;
}

function footer(baseUrl, cities, categories) {
  const cityLinks = cities.slice(0, 6).map(c => `<a href="${baseUrl}/in/${c.slug}">${c.name}</a>`).join('');
  const catLinks = categories.map(c => `<a href="${baseUrl}/in/hyderabad/${c.slug}">${c.name}</a>`).join('');
  return `<footer>
    <div class="wrap">
      <div class="footer-grid">
        <div class="footer-col">
          <h4>⚡ Zappy</h4>
          <p>India's fastest on-demand service platform. Verified professionals at your doorstep.</p>
        </div>
        <div class="footer-col">
          <h4>Cities</h4>${cityLinks}
        </div>
        <div class="footer-col">
          <h4>Services</h4>${catLinks}
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <a href="${baseUrl}/about">About Us</a>
          <a href="${baseUrl}/careers">Careers</a>
          <a href="${baseUrl}/partner">Become a Partner</a>
          <a href="${baseUrl}/support">Help & Support</a>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} Zappy Technologies Pvt. Ltd. All rights reserved.</span>
        <span><a href="${baseUrl}/privacy">Privacy Policy</a> | <a href="${baseUrl}/terms">Terms of Service</a></span>
      </div>
    </div>
  </footer>`;
}

function wrapPage({ title, description, canonical, schemas, ogImage, body, baseUrl, cities, categories }) {
  const schemaBlocks = schemas.map(sc =>
    `<script type="application/ld+json">${JSON.stringify(sc)}</script>`
  ).join('\n  ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">

  <!-- Open Graph -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Zappy">
  <meta property="og:image" content="${ogImage || `${baseUrl}/og-image.jpg`}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="en_IN">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImage || `${baseUrl}/og-image.jpg`}">

  <!-- Robots -->
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">

  <!-- Theme -->
  <meta name="theme-color" content="#2563EB">

  <!-- Structured Data -->
  ${schemaBlocks}

  <style>${CRITICAL_CSS}</style>
</head>
<body>
${nav(baseUrl)}
${body}
${trustBar()}
${footer(baseUrl, cities, categories)}
</body>
</html>`;
}

/**
 * City landing page — /in/:city
 */
function cityPage(city, categories, cities) {
  const baseUrl = s.BASE_URL;
  const canonical = `${baseUrl}/in/${city.slug}`;
  const title = `Zappy ${city.name} — On-Demand Home Services | Mobile Repair, Electrician, Plumber & More`;
  const description = `Book verified professionals in ${city.name} instantly. Mobile repair, bike puncture, electricians, plumbers, birthday decorations — 15-min response. Doorstep service across all areas.`;

  const schemas = [
    s.organization(),
    s.localBusiness(city, null),
    s.breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: city.name, url: `/in/${city.slug}` },
    ]),
    s.faqSchema(categories.flatMap(c => c.faqs.slice(0, 1))),
  ];

  const catCards = categories.map(c => `
    <a href="${baseUrl}/in/${city.slug}/${c.slug}" class="cat-card">
      <span class="cat-emoji">${c.icon}</span>
      <div class="cat-name">${c.name}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">From ${c.startingPrice}</div>
    </a>`).join('');

  const areaChips = city.areas.map(a => `
    <a href="${baseUrl}/in/${city.slug}/${a.slug}/mobile-repair" class="area-chip">${a.name}</a>`).join('');

  const cityLinks = cities.filter(c => c.slug !== city.slug).map(c =>
    `<a href="${baseUrl}/in/${c.slug}" class="area-chip">${c.name}</a>`).join('');

  const body = `
${breadcrumb([{ name: 'Home', url: baseUrl }, { name: city.name, url: canonical }])}
<section class="hero">
  <div class="wrap">
    <div class="hero-badge">📍 Serving ${city.name}, ${city.state}</div>
    <h1 data-speakable="true">On-Demand Services in ${city.name}<br>Professionals at Your Doorstep</h1>
    <p data-speakable="true">Get verified professionals in ${city.name} within 15 minutes. Mobile repair, electricians, plumbers, bike mechanics, and birthday decorators — all in one app.</p>
    <div class="hero-actions">
      <a href="${baseUrl}" class="btn-primary">⚡ Book Now — It's Free</a>
      <a href="${baseUrl}/services" class="btn-secondary">Browse All Services</a>
    </div>
  </div>
</section>

<div class="wrap">
  <div class="stats">
    <div class="stat"><div class="stat-num">15 min</div><div class="stat-label">Avg Response Time</div></div>
    <div class="stat"><div class="stat-num">4.7★</div><div class="stat-label">Average Rating</div></div>
    <div class="stat"><div class="stat-num">500+</div><div class="stat-label">Verified Experts in ${city.name}</div></div>
    <div class="stat"><div class="stat-num">24/7</div><div class="stat-label">Available Always</div></div>
    <div class="stat"><div class="stat-num">50K+</div><div class="stat-label">Jobs Completed</div></div>
  </div>

  <section class="section">
    <h2 class="section-title">Popular Services in ${city.name}</h2>
    <p class="section-sub">Tap any service to see pricing and book instantly.</p>
    <div class="cat-grid">${catCards}</div>
  </section>

  <section class="section" style="padding-top:0">
    <h2 class="section-title">Areas We Serve in ${city.name}</h2>
    <p class="section-sub">Zappy operates across all major areas. Select your area for hyperlocal results.</p>
    <div class="area-grid">${areaChips}</div>
  </section>

  <section class="section" style="padding-top:0">
    <h2 class="section-title">How Zappy Works</h2>
    <p class="section-sub">Four simple steps to get professional help at your doorstep.</p>
    <div class="how-grid">
      <div class="how-step"><div class="step-num">1</div><div class="step-name">Describe the Issue</div><div class="step-text">Tell us what you need — repair, installation, or emergency. Takes 30 seconds.</div></div>
      <div class="how-step"><div class="step-num">2</div><div class="step-name">Get Matched Instantly</div><div class="step-text">Zappy finds the nearest verified professional and dispatches them immediately.</div></div>
      <div class="how-step"><div class="step-num">3</div><div class="step-name">Professional Arrives</div><div class="step-text">Trained, background-verified expert arrives at your door with all tools needed.</div></div>
      <div class="how-step"><div class="step-num">4</div><div class="step-name">Pay Securely</div><div class="step-text">Review the work, pay via UPI, card, or cash. Service warranty included.</div></div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <h2 class="section-title">Frequently Asked Questions</h2>
    <p class="section-sub">Everything you need to know about Zappy in ${city.name}.</p>
    ${faqSection([
      { q: `Is Zappy available across all areas of ${city.name}?`, a: `Yes. Zappy operates across all major areas of ${city.name} including ${city.areas.slice(0, 4).map(a => a.name).join(', ')}, and many more. Coverage is expanding continuously.` },
      { q: 'How fast can a professional reach me?', a: 'Average response time is 15–25 minutes in most areas. For urgent requests, Zappy prioritizes emergency dispatch.' },
      { q: 'Are all Zappy professionals verified?', a: 'Yes. Every professional on Zappy goes through identity verification, skills assessment, and background checks before being onboarded. Your safety is our priority.' },
      { q: 'What payment methods does Zappy accept?', a: 'Zappy accepts UPI, credit/debit cards, net banking, and cash. All digital payments are secured with 256-bit encryption.' },
      { q: 'Is there a service warranty?', a: 'Yes. All services booked through Zappy carry a 30-day service warranty. If the same issue recurs, we fix it free of charge.' },
    ])}
  </section>

  <section class="section" style="padding-top:0">
    <h2 class="section-title">Zappy in Other Cities</h2>
    <div class="area-grid">${cityLinks}</div>
  </section>
</div>

<div class="cta-banner">
  <div class="wrap">
    <h2>Need Help in ${city.name}?</h2>
    <p>Get a verified professional at your doorstep in 15 minutes. Available 24/7.</p>
    <a href="${baseUrl}" class="btn-white">⚡ Book Now — Free</a>
  </div>
</div>`;

  return wrapPage({ title, description, canonical, schemas, body, baseUrl, cities, categories });
}

/**
 * Category + City landing page — /in/:city/:category
 */
function categoryPage(city, category, categories, cities) {
  const baseUrl = s.BASE_URL;
  const canonical = `${baseUrl}/in/${city.slug}/${category.slug}`;
  const locationName = city.name;
  const title = `${category.name} in ${locationName} — Doorstep Service | Zappy`;
  const description = category.descTemplate(locationName);

  const schemas = [
    s.organization(),
    s.localBusiness(city, category),
    s.serviceSchema(city, category),
    s.faqSchema(category.faqs),
    s.howToSchema(category.howTo, city, category),
    s.breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: locationName, url: `/in/${city.slug}` },
      { name: category.name, url: `/in/${city.slug}/${category.slug}` },
    ]),
    s.speakable(title, description),
  ];

  const featCards = category.features.map(f => `
    <div class="feat-card">
      <div class="feat-icon">✓</div>
      <div class="feat-text">${f}</div>
    </div>`).join('');

  const howToSteps = category.howTo.steps.map((step, i) => `
    <div class="how-step">
      <div class="step-num">${i + 1}</div>
      <div class="step-name">${step.name}</div>
      <div class="step-text">${step.text}</div>
    </div>`).join('');

  const areaLinks = city.areas.map(a => `
    <a href="${baseUrl}/in/${city.slug}/${a.slug}/${category.slug}" class="area-chip">${a.name}</a>`).join('');

  const otherCats = categories.filter(c => c.slug !== category.slug).map(c => `
    <a href="${baseUrl}/in/${city.slug}/${c.slug}" class="area-chip">${c.icon} ${c.name}</a>`).join('');

  const voiceAnswerBlock = `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:20px 24px;margin-bottom:32px">
      <div style="font-size:12px;font-weight:600;color:#2563eb;margin-bottom:6px">🎤 VOICE SEARCH ANSWER</div>
      <p style="font-size:15px;color:#1e3a8a;font-weight:500" data-speakable="true">
        "${category.voiceQuery}" — Zappy has ${category.name} professionals available in ${locationName} right now.
        Average arrival time is 15–25 minutes. Starting from ${category.startingPrice}.
        <a href="${baseUrl}${category.spaPath}">Book on Zappy</a>.
      </p>
    </div>`;

  const body = `
${breadcrumb([
    { name: 'Home', url: baseUrl },
    { name: locationName, url: `${baseUrl}/in/${city.slug}` },
    { name: category.name, url: canonical },
  ])}
<section class="hero">
  <div class="wrap">
    <div class="hero-badge">${category.icon} ${locationName} | From ${category.startingPrice}</div>
    <h1 data-speakable="true">${category.h1Template(locationName)}</h1>
    <p data-speakable="true">${description}</p>
    <div class="hero-actions">
      <a href="${baseUrl}${category.spaPath}" class="btn-primary">⚡ Book Now — Instant</a>
      <a href="${baseUrl}/in/${city.slug}" class="btn-secondary">← All Services in ${locationName}</a>
    </div>
  </div>
</section>

<div class="wrap">
  <div class="stats">
    <div class="stat"><div class="stat-num">${category.avgTime}</div><div class="stat-label">Average Service Time</div></div>
    <div class="stat"><div class="stat-num">4.8★</div><div class="stat-label">Customer Rating</div></div>
    <div class="stat"><div class="stat-num">${category.startingPrice}</div><div class="stat-label">Starting Price</div></div>
    <div class="stat"><div class="stat-num">15 min</div><div class="stat-label">Avg Arrival Time</div></div>
    <div class="stat"><div class="stat-num">30-Day</div><div class="stat-label">Service Warranty</div></div>
  </div>

  <section class="section">
    ${voiceAnswerBlock}
    <h2 class="section-title">What's Included</h2>
    <p class="section-sub">All-inclusive ${category.name.toLowerCase()} services in ${locationName}.</p>
    <div class="features-grid">${featCards}</div>
  </section>

  <section class="section" style="padding-top:0">
    <h2 class="section-title">${category.howTo.name}</h2>
    <p class="section-sub">Getting professional help is just 4 steps away.</p>
    <div class="how-grid">${howToSteps}</div>
  </section>

  <section class="section" style="padding-top:0">
    <h2 class="section-title">Frequently Asked Questions</h2>
    <p class="section-sub">Common questions about ${category.name.toLowerCase()} in ${locationName}.</p>
    ${faqSection(category.faqs)}
  </section>

  <section class="section" style="padding-top:0">
    <h2 class="section-title">${category.name} by Area in ${locationName}</h2>
    <p class="section-sub">Select your area for neighbourhood-level results.</p>
    <div class="area-grid">${areaLinks}</div>
  </section>

  <section class="section" style="padding-top:0">
    <h2 class="section-title">Other Services in ${locationName}</h2>
    <div class="area-grid">${otherCats}</div>
  </section>
</div>

<div class="cta-banner">
  <div class="wrap">
    <h2>Book ${category.name} in ${locationName} Now</h2>
    <p>${category.voiceQuery.replace('?', '')} — Zappy has you covered. 15-min response.</p>
    <a href="${baseUrl}${category.spaPath}" class="btn-white">⚡ Book ${category.name} — ${category.startingPrice}</a>
  </div>
</div>`;

  return wrapPage({ title, description, canonical, schemas, body, baseUrl, cities, categories });
}

/**
 * Area + Category + City page — /in/:city/:area/:category
 */
function areaPage(city, area, category, categories, cities) {
  const baseUrl = s.BASE_URL;
  const canonical = `${baseUrl}/in/${city.slug}/${area.slug}/${category.slug}`;
  const locationName = `${area.name}, ${city.name}`;
  const title = `${category.name} in ${area.name}, ${city.name} — Instant Doorstep Service | Zappy`;
  const description = category.descTemplate(locationName);

  const schemas = [
    s.localBusiness(city, category),
    s.serviceSchema({ ...city, name: locationName }, category),
    s.faqSchema(category.faqs.slice(0, 3)),
    s.breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: city.name, url: `/in/${city.slug}` },
      { name: category.name, url: `/in/${city.slug}/${category.slug}` },
      { name: area.name, url: `/in/${city.slug}/${area.slug}/${category.slug}` },
    ]),
  ];

  const nearbyAreas = city.areas.filter(a => a.slug !== area.slug).slice(0, 8);
  const nearbyLinks = nearbyAreas.map(a =>
    `<a href="${baseUrl}/in/${city.slug}/${a.slug}/${category.slug}" class="area-chip">${a.name}</a>`).join('');

  const body = `
${breadcrumb([
    { name: 'Home', url: baseUrl },
    { name: city.name, url: `${baseUrl}/in/${city.slug}` },
    { name: category.name, url: `${baseUrl}/in/${city.slug}/${category.slug}` },
    { name: area.name, url: canonical },
  ])}
<section class="hero">
  <div class="wrap">
    <div class="hero-badge">📍 ${area.name}, ${city.name}</div>
    <h1 data-speakable="true">${category.h1Template(locationName)}</h1>
    <p data-speakable="true">${description}</p>
    <div class="hero-actions">
      <a href="${baseUrl}${category.spaPath}" class="btn-primary">⚡ Book in ${area.name} Now</a>
      <a href="${baseUrl}/in/${city.slug}/${category.slug}" class="btn-secondary">All of ${city.name} →</a>
    </div>
  </div>
</section>

<div class="wrap">
  <div class="stats">
    <div class="stat"><div class="stat-num">15 min</div><div class="stat-label">Response in ${area.name}</div></div>
    <div class="stat"><div class="stat-num">4.8★</div><div class="stat-label">Rating</div></div>
    <div class="stat"><div class="stat-num">${category.startingPrice}</div><div class="stat-label">Starting Price</div></div>
    <div class="stat"><div class="stat-num">24/7</div><div class="stat-label">Available</div></div>
  </div>

  <section class="section">
    <h2 class="section-title">${category.name} in ${area.name}</h2>
    <p class="section-sub" data-speakable="true">
      Zappy has verified ${category.name.toLowerCase()} professionals actively serving ${area.name}, ${city.name}.
      Get doorstep service in 15–25 minutes. ${category.features.slice(0, 3).join(', ')}, and more.
      Starting from ${category.startingPrice}.
    </p>
    <div style="margin-top:20px">
      <a href="${baseUrl}${category.spaPath}" class="btn-primary">Book ${category.name} in ${area.name}</a>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <h2 class="section-title">Frequently Asked Questions</h2>
    ${faqSection(category.faqs.slice(0, 4))}
  </section>

  <section class="section" style="padding-top:0">
    <h2 class="section-title">${category.name} in Nearby Areas</h2>
    <div class="area-grid">${nearbyLinks}</div>
  </section>
</div>

<div class="cta-banner">
  <div class="wrap">
    <h2>${category.name} in ${area.name}?</h2>
    <p>Instant professional service at your doorstep. Verified experts. Warranty included.</p>
    <a href="${baseUrl}${category.spaPath}" class="btn-white">⚡ Book Now — ${category.startingPrice}</a>
  </div>
</div>`;

  return wrapPage({ title, description, canonical, schemas, body, baseUrl, cities, categories });
}

module.exports = { cityPage, categoryPage, areaPage };
