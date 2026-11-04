// One booking, one amount: what the customer's screen shows, what the pro is asked to collect and what the receipt says agree to the paisa, for every kind and every mix of surge, boost, tip and carried fee.
const path = require('path');
const mongoose = require('mongoose');
const { execFileSync } = require('child_process');
const { startMongo, stopMongo } = require('./helpers');

jest.setTimeout(90000);
beforeAll(startMongo);
afterAll(stopMongo);

const id = () => String(new mongoose.Types.ObjectId());
const EXTRAS = {
  none: {},
  night: { surge: { paise: 2000, lines: [{ type: 'night', label: 'Late-night fee', paise: 2000 }] } },
  surgeRainNight: { surge: { paise: 6500, lines: [{ type: 'surge', label: 'Surge fee', paise: 3000 }, { type: 'rain', label: 'Rain fee', paise: 1500 }, { type: 'night', label: 'Late-night fee', paise: 2000 }] } },
  boost: { boost: { paise: 3000 } },
  tipOnBill: { tip: { paise: 5000, method: 'with_payment' } },
  tipInApp: { tip: { paise: 5000, method: 'upi_direct' } },
  carried: { carriedFee: { paise: 4000 } },
  everything: { surge: { paise: 2000, lines: [{ type: 'night', label: 'Late-night fee', paise: 2000 }] }, boost: { paise: 3000 }, tip: { paise: 2000, method: 'with_payment' }, carriedFee: { paise: 4000 } },
};

const repairDoc = (extra) => ({ _id: id(), userId: id(), vertical: 'dance_001', repairCode: 'zumba', status: 'QA_PENDING', paymentMethod: 'cash', paymentStatus: 'unpaid', statusHistory: [],
  priceSnapshot: { subtotalPaise: 25000, platformFeePaise: 1000, taxPaise: 0, totalPaise: 26000, labourPaise: 25000 }, ...extra });
const petDoc = (extra) => ({ _id: id(), userId: id(), categoryCode: 'pet_grooming', status: 'SERVICE_COMPLETED', paymentMethod: 'cash', paymentStatus: 'unpaid', statusHistory: [], pets: [],
  pricing: { servicesPaise: 50000, addonsPaise: 0, travelPaise: 4000, platformFeePaise: 1000, taxPaise: 0, totalPaise: 55000 }, ...extra });

function screenTotals(cases) {
  const shared = path.join(__dirname, '../../shared/src/customer').replace(/\\/g, '/');
  const code = `
    import { KINDS } from 'file:///${shared}/jobKinds.js';
    const cases = ${JSON.stringify(cases)};
    console.log(JSON.stringify(cases.map(([kind, doc]) => {
      const job = KINDS[kind].toJob({ booking: doc, quotes: [] });
      return { total: job.price.totalPaise, lineSum: job.price.lines.reduce((a, [, p]) => a + (p || 0), 0) };
    })));`;
  const hook = require('url').pathToFileURL(path.join(__dirname, 'esm-ext.mjs')).href;
  const register = `data:text/javascript,import{register}from'node:module';register(${JSON.stringify(hook)});`;
  return JSON.parse(execFileSync(process.execPath, ['--import', register, '--input-type=module', '-e', code]).toString());
}

test.each(Object.keys(EXTRAS))('repair and pet with %s: screen = pro collects = receipt', async (name) => {
  const { PAYABLES } = require('../src/modules/payment/payables');
  const { jobFacts } = require('../src/modules/messaging/facts');
  const docs = [['repair', repairDoc(EXTRAS[name])], ['pet', petDoc(EXTRAS[name])]];
  const screen = screenTotals(docs);
  for (const [i, [kind, doc]] of docs.entries()) {
    const due = PAYABLES[kind].payable(doc).amountPaise;
    const receipt = (await jobFacts(kind, doc)).totalPaise;
    expect({ kind, screen: screen[i].total }).toEqual({ kind, screen: due });
    expect({ kind, receipt }).toEqual({ kind, receipt: due });
    expect({ kind, lines: screen[i].lineSum }).toEqual({ kind, lines: due });
  }
});

test('the Zumba booking from the report: ₹250 + ₹10 + ₹20 late-night is ₹280 on every screen', async () => {
  const { PAYABLES } = require('../src/modules/payment/payables');
  const doc = repairDoc(EXTRAS.night);
  const [screen] = screenTotals([['repair', doc]]);
  expect(screen.total).toBe(28000);
  expect(PAYABLES.repair.payable(doc).amountPaise).toBe(28000);
  expect((await require('../src/modules/messaging/facts').jobFacts('repair', doc)).totalPaise).toBe(28000);
});
