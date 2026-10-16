// Fleet AI (workforce/fleet-ai): briefing and answers from the fleet's figures; no phone numbers sent; cached; falls back when no model answers.
jest.mock('../src/modules/ai/chat.service', () => ({ chat: jest.fn(), enabled: () => true }));
jest.mock('../src/modules/admin-portal/expansion.service', () => ({ nextLaunch: jest.fn().mockResolvedValue({ sites: [{ area: 'Kokapet', jobsPerMonth: 64, staffNeeded: 1, unserved: 22, topServices: [{ name: 'AC repair' }], partnersNearby: 0 }], coverage: { hubPct: 58 } }) }));
const { startMongo, stopMongo } = require('./helpers');
const ai = require('../src/modules/ai/chat.service');
const Worker = require('../src/modules/worker/worker.model');
const Hub = require('../src/modules/workforce/hub.model');
const fleetAi = require('../src/modules/workforce/fleet-ai.service');
const payroll = require('../src/modules/workforce/payroll.service');

jest.setTimeout(60000);

beforeAll(async () => {
  await startMongo();
  const hub = await Hub.create({ name: 'Narsingi', city: 'Hyderabad', meetingPoint: { location: { type: 'Point', coordinates: [78.36, 17.39] } } });
  await Worker.create({ name: 'Ravi Kumar', phone: '9848012345', employment: { type: 'staff', hubId: hub._id, salaryPaise: 1300000 } });
});
afterAll(stopMongo);
beforeEach(() => ai.chat.mockReset());

test('the briefing is written from the figures, with first names and no phone numbers, and cached', async () => {
  ai.chat.mockResolvedValueOnce({ text: '1. Fix Narsingi attendance.', model: 'm' });
  const month = payroll.monthOf();
  const out = await fleetAi.briefing(month);
  expect(out.text).toMatch(/Narsingi/);
  const sent = JSON.stringify(ai.chat.mock.calls[0][0]);
  expect(sent).toContain('Ravi');
  expect(sent).not.toContain('Kumar');
  expect(sent).not.toContain('9848012345');
  expect(sent).toContain('Kokapet');
  expect((await fleetAi.briefing(month)).cached).toBe(true);
  expect(ai.chat).toHaveBeenCalledTimes(1);
});

test('a question is answered from the same figures; no model answering gives null for the route to explain', async () => {
  ai.chat.mockResolvedValueOnce({ text: 'Ravi, with the most jobs.', model: 'm' });
  expect((await fleetAi.ask(payroll.monthOf(), 'Who deserves a bonus?')).text).toMatch(/Ravi/);
  expect(JSON.stringify(ai.chat.mock.calls[0][0])).toContain('Who deserves a bonus?');
  ai.chat.mockResolvedValueOnce(null);
  expect(await fleetAi.ask(payroll.monthOf(), 'Anything?')).toBeNull();
});
