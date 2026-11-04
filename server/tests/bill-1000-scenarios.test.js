// 1000 generated bookings (seeded, so a failure repeats): odd paise, zero fees, every surge mix, tips on the bill or in the app, boosts, carried fees and old records without surge lines. Screen, pro and receipt must agree on each.
const path = require('path');
const { execFileSync } = require('child_process');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(180000);
beforeAll(startMongo);
afterAll(stopMongo);

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function scenarios(n, seed = 20261105) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const money = () => pick([0, 100, 999, 1001, 2500, 4999, 12345, 25000, 99999, Math.floor(r() * 300000)]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const kind = pick(['repair', 'pet']);
    const doc = { _id: `65${String(i).padStart(22, '0')}`, userId: '650000000000000000000001', status: kind === 'repair' ? 'QA_PENDING' : 'SERVICE_COMPLETED', paymentMethod: 'cash', paymentStatus: 'unpaid', statusHistory: [], pets: [] };
    const base = money();
    const fee = pick([0, 1000, 1500]);
    const tax = pick([0, 0, Math.round(base * 0.18)]);
    if (kind === 'repair') doc.priceSnapshot = { subtotalPaise: base, platformFeePaise: fee, taxPaise: tax, labourPaise: base, totalPaise: base + fee + tax };
    else doc.pricing = { servicesPaise: base, travelPaise: 0, platformFeePaise: fee, taxPaise: tax, totalPaise: base + fee + tax };
    const lines = [];
    if (r() < 0.4) lines.push({ type: 'night', label: 'Late-night fee', paise: pick([2000, 2500, 3333]) });
    if (r() < 0.3) lines.push({ type: 'rain', label: 'Rain fee', paise: pick([1500, 2000]) });
    if (r() < 0.3) lines.push({ type: 'surge', label: 'Surge fee', paise: pick([1000, 4999, 7777]) });
    if (lines.length) doc.surge = { paise: lines.reduce((a, l) => a + l.paise, 0), lines: r() < 0.1 ? undefined : lines };
    if (r() < 0.25) doc.boost = { paise: pick([1000, 3000, 5000]) };
    if (r() < 0.3) doc.tip = { paise: pick([2000, 5000, 10000]), method: pick(['with_payment', 'upi_direct']) };
    if (r() < 0.2) doc.carriedFee = { paise: pick([2000, 5000]) };
    out.push([kind, doc]);
  }
  return out;
}

test('1000 bookings: the screen, what the pro collects and the receipt agree to the paisa', async () => {
  const cases = scenarios(1000);
  const shared = path.join(__dirname, '../../shared/src/customer').replace(/\\/g, '/');
  const hook = require('url').pathToFileURL(path.join(__dirname, 'esm-ext.mjs')).href;
  const register = `data:text/javascript,import{register}from'node:module';register(${JSON.stringify(hook)});`;
  const code = `
    import { KINDS } from 'file:///${shared}/jobKinds.js';
    import { readFileSync } from 'node:fs';
    const cases = JSON.parse(readFileSync(0, 'utf8'));
    console.log(JSON.stringify(cases.map(([kind, doc]) => {
      const job = KINDS[kind].toJob({ booking: doc, quotes: [] });
      return [job.price.totalPaise, job.price.lines.reduce((a, [, p]) => a + (p || 0), 0)];
    })));`;
  const screen = JSON.parse(execFileSync(process.execPath, ['--import', register, '--input-type=module', '-e', code], { input: JSON.stringify(cases), maxBuffer: 1 << 26 }).toString());

  const { PAYABLES } = require('../src/modules/payment/payables');
  const { jobFacts } = require('../src/modules/messaging/facts');
  const wrong = [];
  for (const [i, [kind, doc]] of cases.entries()) {
    const due = PAYABLES[kind].payable(doc).amountPaise;
    const receipt = (await jobFacts(kind, doc)).totalPaise;
    const [total, lineSum] = screen[i];
    if (total !== due || receipt !== due || lineSum !== due) wrong.push({ i, kind, due, screen: total, lineSum, receipt, surge: doc.surge, tip: doc.tip });
  }
  expect(wrong.slice(0, 5)).toEqual([]);
  expect(cases).toHaveLength(1000);
});
