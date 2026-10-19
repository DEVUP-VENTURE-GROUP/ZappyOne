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
