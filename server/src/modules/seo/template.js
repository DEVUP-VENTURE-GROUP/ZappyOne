// Server-rendered city, state and service pages for search engines and AI answer engines, served on www.zappyone.com/in/* (client/vercel.json rewrites there). Only claims that are true: live cities book now, the rest say coming soon.
const BASE = 'https://www.zappyone.com';
const APP = 'https://play.google.com/store/apps/details?id=com.zappyone.app';
const SOCIAL = ['https://www.instagram.com/zappyone.india', 'https://www.linkedin.com/company/zappyone/', 'https://www.threads.com/@zappyone.india', APP];

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const ORG = { '@type': 'Organization', '@id': `${BASE}/#organization`, name: 'ZappyOne', alternateName: ['Zappy One', 'Zappy1', 'Zappyone'], url: `${BASE}/`, logo: `${BASE}/logo.png`, sameAs: SOCIAL };

const CSS = `
:root{--brand:#1F4FD8;--ink:#0F172A;--muted:#475569;--line:#E2E8F0;--canvas:#F8FAFC;--soft:#EEF3FD}
*{box-sizing:border-box}body{margin:0;font-family:Figtree,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--canvas);line-height:1.55}
a{color:var(--brand);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}
header{background:#fff;border-bottom:1px solid var(--line)}header .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-weight:800;font-size:20px;color:var(--ink)}.logo b{color:var(--brand)}
.btn{display:inline-block;background:var(--brand);color:#fff;font-weight:700;padding:12px 20px;border-radius:12px}.btn:hover{text-decoration:none;opacity:.92}
.btn.ghost{background:#fff;color:var(--brand);border:1px solid var(--line)}
.crumbs{font-size:13px;color:var(--muted);padding:16px 0 0}
.hero{padding:28px 0 8px}.hero h1{font-size:clamp(26px,4vw,38px);line-height:1.15;margin:8px 0 12px;text-wrap:balance}.hero p{font-size:17px;color:var(--muted);max-width:66ch;margin:0 0 20px}
.pill{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:var(--soft);color:var(--brand)}
.pill.soon{background:#FEF3C7;color:#92400E}
section{padding:24px 0}h2{font-size:22px;margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px}.card h3{font-size:16px;margin:0 0 6px}.card p{margin:0;font-size:14px;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chips a{background:#fff;border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:14px}
.faq details{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin-bottom:8px}.faq summary{font-weight:700;cursor:pointer}
footer{border-top:1px solid var(--line);margin-top:24px;padding:24px 0;font-size:14px;color:var(--muted)}footer .chips a{font-size:13px}
`;

function page({ title, description, path, schemas, body }) {
  const url = `${BASE}${path}`;
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${url}">
<meta name="robots" content="index,follow,max-image-preview:large"><link rel="icon" href="/favicon.ico">
<meta property="og:type" content="website"><meta property="og:site_name" content="ZappyOne"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${BASE}/og-default.jpg"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': [ORG, ...schemas] })}</script>
<style>${CSS}</style></head><body>
<header><div class="wrap"><a class="logo" href="${BASE}/">Zappy<b>One</b></a><a class="btn" href="${BASE}/">Book on ZappyOne</a></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap"><p><b>ZappyOne</b>, verified home services at your door. Live in Hyderabad, launching city by city across India. A venture of DevUp Ecosystem.</p>
<div class="chips"><a href="${BASE}/in">All cities</a><a href="${BASE}/services">Services</a><a href="${BASE}/faq">FAQ</a><a href="${APP}">Android app</a><a href="${SOCIAL[0]}">Instagram</a><a href="${SOCIAL[1]}">LinkedIn</a><a href="${SOCIAL[2]}">Threads</a></div></div></footer>
</body></html>`;
}

const crumbs = (items) => ({
  html: `<nav class="crumbs">${items.map(([n, p], i) => (i < items.length - 1 ? `<a href="${BASE}${p}">${esc(n)}</a> / ` : esc(n))).join('')}</nav>`,
  schema: { '@type': 'BreadcrumbList', itemListElement: items.map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: `${BASE}${p}` })) },
});

const faqBlock = (faqs) => ({
  html: `<section class="faq"><h2>Questions</h2>${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>`,
  schema: { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
});

const liveCities = (cities) => cities.filter((c) => c.live);
const cityLinks = (cities) => `<div class="chips">${cities.map((c) => `<a href="${BASE}/in/${c.slug}">${esc(c.name)}</a>`).join('')}</div>`;

function indexPage(cities, states) {
  const c = crumbs([['ZappyOne', '/'], ['Cities', '/in']]);
  const live = liveCities(cities);
  const body = `${c.html}<div class="hero"><span class="pill">Live in ${esc(live.map((x) => x.name).join(', '))}</span>
<h1>ZappyOne in your city</h1><p>Verified professionals and ZappyOne's own trained staff at your door, with the price shown before you book. We are launching city by city across India. Find your city below.</p></div>
${states.map((s) => {
    const list = cities.filter((x) => x.stateSlug === s.slug);
    return list.length ? `<section><h2><a href="${BASE}/in/state/${s.slug}">${esc(s.name)}</a></h2>${cityLinks(list)}</section>` : '';
  }).join('')}`;
  return page({ title: 'ZappyOne cities: home services across India', description: 'Find ZappyOne home services in your city. Live in Hyderabad, launching city by city across every state in India.', path: '/in', schemas: [c.schema], body });
}

function statePage(state, cities) {
  const list = cities.filter((x) => x.stateSlug === state.slug);
  const live = liveCities(list);
  const c = crumbs([['ZappyOne', '/'], ['Cities', '/in'], [state.name, `/in/state/${state.slug}`]]);
  const body = `${c.html}<div class="hero"><span class="pill${live.length ? '' : ' soon'}">${live.length ? `Live in ${esc(live.map((x) => x.name).join(', '))}` : 'Coming soon'}</span>
<h1>ZappyOne home services in ${esc(state.name)}</h1><p>${live.length ? `Book verified professionals at your door in ${esc(live.map((x) => x.name).join(', '))}. ` : ''}ZappyOne is launching city by city across ${esc(state.name)}.</p></div>
<section><h2>Cities in ${esc(state.name)}</h2>${cityLinks(list)}</section>`;
  return page({ title: `ZappyOne in ${state.name}: home services at your door`, description: `ZappyOne home services in ${state.name}: ${list.map((x) => x.name).slice(0, 6).join(', ')}. ${live.length ? 'Book now in live cities.' : 'Launching soon.'}`, path: `/in/state/${state.slug}`, schemas: [c.schema], body });
}

function cityPage(city, categories, cities) {
  const c = crumbs([['ZappyOne', '/'], ['Cities', '/in'], [city.state, `/in/state/${city.stateSlug}`], [city.name, `/in/${city.slug}`]]);
  const nearby = cities.filter((x) => x.stateSlug === city.stateSlug && x.slug !== city.slug);
  if (!city.live) {
    const live = liveCities(cities);
    const f = faqBlock([
      [`Is ZappyOne available in ${city.name}?`, `Not yet. ZappyOne is live in ${live.map((x) => x.name).join(', ')} and is launching city by city. Open zappyone.com or the app and enter your ${city.name} address to be told when we launch there.`],
      ['What will ZappyOne offer?', `The same services as in our live cities: ${categories.map((x) => x.short.toLowerCase()).join(', ')}.`],
    ]);
    const body = `${c.html}<div class="hero"><span class="pill soon">Coming soon</span><h1>ZappyOne is coming to ${esc(city.name)}</h1>
<p>Verified professionals and ZappyOne staff at your door in ${esc(city.name)}, ${esc(city.state)}, with the price shown before you book. Enter your address on ZappyOne to be the first to know when we launch.</p>
<a class="btn" href="${BASE}/">Get notified on ZappyOne</a> <a class="btn ghost" href="${APP}">Get the app</a></div>
<section><h2>What is coming to ${esc(city.name)}</h2><div class="grid">${categories.map((x) => `<div class="card"><h3>${esc(x.name)}</h3><p>${esc(x.what)}</p></div>`).join('')}</div></section>
${nearby.length ? `<section><h2>More cities in ${esc(city.state)}</h2>${cityLinks(nearby)}</section>` : ''}${f.html}`;
    return page({ title: `ZappyOne ${city.name}: home services coming soon`, description: `ZappyOne is launching in ${city.name}, ${city.state}: bike and car wash, repairs, family errands, elder care, pet care and events at your door. Get notified.`, path: `/in/${city.slug}`, schemas: [c.schema, f.schema], body });
  }
  const f = faqBlock([
    [`Is ZappyOne available in ${city.name}?`, `Yes. ZappyOne is live in ${city.name}. Enter your address on zappyone.com or in the app to see the services available at your location.`],
    ['Are the professionals verified?', 'Every professional completes an ID check and is approved separately for each service. Family Assist work is done only by ZappyOne\'s own salaried staff.'],
    ['How is the price decided?', 'You see the full price before you book. Shopping and medicine bills are paid at actual cost, shown apart from the service fee.'],
    ['How do I pay?', 'After the service, in cash or online by UPI or card.'],
  ]);
  const local = { '@type': 'HomeAndConstructionBusiness', '@id': `${BASE}/in/${city.slug}#local`, name: `ZappyOne ${city.name}`, url: `${BASE}/in/${city.slug}`, image: `${BASE}/og-default.jpg`, parentOrganization: { '@id': `${BASE}/#organization` }, areaServed: { '@type': 'City', name: city.name }, address: { '@type': 'PostalAddress', addressLocality: city.name, addressRegion: city.state, addressCountry: 'IN' }, geo: { '@type': 'GeoCoordinates', latitude: city.lat, longitude: city.lng }, priceRange: '₹₹' };
  const body = `${c.html}<div class="hero"><span class="pill">Live now</span><h1>Home services in ${esc(city.name)}, at your door</h1>
<p>Book verified professionals and ZappyOne staff in ${esc(city.name)}. The price is shown before you book, you track your helper live, and you pay after the service.</p><a class="btn" href="${BASE}/">Book on ZappyOne</a> <a class="btn ghost" href="${APP}">Get the app</a></div>
<section><h2>Services in ${esc(city.name)}</h2><div class="grid">${categories.map((x) => `<a class="card" href="${BASE}/in/${city.slug}/${x.slug}"><h3>${esc(x.name)}</h3><p>${esc(x.what)}</p></a>`).join('')}</div></section>
${city.areas.length ? `<section><h2>Areas we cover in ${esc(city.name)}</h2><div class="chips">${city.areas.map((a) => `<a href="${BASE}/in/${city.slug}/${a.slug}/${categories[0].slug}">${esc(a.name)}</a>`).join('')}</div></section>` : ''}
${nearby.length ? `<section><h2>More cities in ${esc(city.state)}</h2>${cityLinks(nearby)}</section>` : ''}${f.html}`;
  return page({ title: `ZappyOne ${city.name}: home services at your door`, description: `Book verified home services in ${city.name}: bike and car wash, phone and laptop repair, grocery and medicine runs, elder care, pet care and events. Price before you book, live tracking.`, path: `/in/${city.slug}`, schemas: [c.schema, local, f.schema], body });
}

function servicePage(city, category, categories, area = null) {
  const where = area ? `${area.name}, ${city.name}` : city.name;
  const path = area ? `/in/${city.slug}/${area.slug}/${category.slug}` : `/in/${city.slug}/${category.slug}`;
  const c = crumbs([['ZappyOne', '/'], ['Cities', '/in'], [city.name, `/in/${city.slug}`], ...(area ? [[area.name, path]] : []), [category.short, path]]);
  const service = { '@type': 'Service', name: `${category.name} in ${where}`, serviceType: category.short, description: category.what, provider: { '@id': `${BASE}/#organization` }, areaServed: { '@type': area ? 'Place' : 'City', name: where }, url: `${BASE}${path}` };
  const f = faqBlock([
    [`How do I book ${category.short.toLowerCase()} in ${where}?`, `Open ZappyOne, choose ${category.short.toLowerCase()}, enter your ${where} address and confirm. You see the full price before you book.`],
    ['Who comes to my door?', 'A verified professional, or for Family Assist a ZappyOne staff member. You see who is coming and track them live.'],
  ]);
  const others = categories.filter((x) => x.slug !== category.slug);
  const body = `${c.html}<div class="hero"><span class="pill">Live in ${esc(city.name)}</span><h1>${esc(category.name)} in ${esc(where)}</h1><p>${esc(category.what)} Book on ZappyOne with the price shown first and live tracking.</p>
<a class="btn" href="${BASE}${category.spaPath}">Book ${esc(category.short.toLowerCase())}</a></div>
${area ? '' : (city.areas.length ? `<section><h2>${esc(category.short)} by area</h2><div class="chips">${city.areas.map((a) => `<a href="${BASE}/in/${city.slug}/${a.slug}/${category.slug}">${esc(a.name)}</a>`).join('')}</div></section>` : '')}
<section><h2>More in ${esc(city.name)}</h2><div class="chips">${others.map((x) => `<a href="${BASE}/in/${city.slug}/${x.slug}">${esc(x.short)}</a>`).join('')}</div></section>${f.html}`;
  return page({ title: `${category.name} in ${where} | ZappyOne`, description: `${category.name} in ${where} with ZappyOne. ${category.what} Price before you book, live tracking.`, path, schemas: [c.schema, service, f.schema], body });
}

const categoryPage = (city, category, categories) => servicePage(city, category, categories);
const areaPage = (city, area, category, categories) => servicePage(city, category, categories, area);

module.exports = { indexPage, statePage, cityPage, categoryPage, areaPage, BASE };
