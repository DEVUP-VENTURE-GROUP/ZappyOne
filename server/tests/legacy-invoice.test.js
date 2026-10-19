// Old orders' invoice (service/invoice.service): real business details, no placeholder GSTIN, no "undefined", lines add up to the total.
const mongoose = require('mongoose');
const { startMongo, stopMongo } = require('./helpers');
const Order = require('../src/modules/order/order.model');
const invoice = require('../src/modules/service/invoice.service');

jest.setTimeout(60000);
beforeAll(startMongo);
afterAll(stopMongo);

test('an old puncture order renders with real details and lines that add up', async () => {
  const { insertedId } = await Order.collection.insertOne({
    userId: new mongoose.Types.ObjectId(), service: 'puncture', status: 'completed', completedAt: new Date(), createdAt: new Date(),
    pickupLocation: { address: 'Vikarabad' }, pricing: { distanceKm: 0.05, distanceFee: 1, platformFee: 0, subtotal: 71, total: 181 },
  });
  const data = await invoice.getInvoiceData(insertedId);
  const html = invoice.renderHtml(data);
  expect(html).not.toMatch(/undefined|zappy\.example|36AAACQ1234F1ZZ|Zappy Services/);
  expect(html).toContain('Receipt');
  expect(data.lineItems.reduce((t, l) => t + l.amount, 0) + data.tax).toBe(181);
  expect(html).toContain('₹181');
});

test('the app gets the same bill as data, in paise, adding up to the total', async () => {
  const userId = new mongoose.Types.ObjectId();
  const { insertedId } = await Order.collection.insertOne({
    userId, service: 'puncture', status: 'completed', completedAt: new Date(), createdAt: new Date(),
    pickupLocation: { address: 'Vikarabad' }, pricing: { distanceKm: 0.05, distanceFee: 1, platformFee: 0, subtotal: 71, total: 181 },
  });
  jest.spyOn(require('../src/modules/order/order.service'), 'getOrder').mockResolvedValue({ _id: insertedId, userId });
  const ctrl = require('../src/modules/order/order.controller');
  let body;
  await ctrl.getInvoice({ params: { id: String(insertedId) }, auth: { sub: String(userId) }, query: { view: 'json' } }, { json: (b) => { body = b; }, status: () => ({ json: (b) => { body = b; } }), setHeader() {}, send() {} }, (e) => { throw e; });
  expect(body.bill.title).toBe('Receipt');
  expect(body.bill.totalPaise).toBe(18100);
  expect(body.bill.lines.reduce((t, l) => t + l.paise, 0)).toBe(18100);
  expect(JSON.stringify(body)).not.toMatch(/undefined|zappy\.example/);
});
