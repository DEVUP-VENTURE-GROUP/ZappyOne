// Plan sweeps run every 5 minutes over every visit; these reads must stay on an index as the data grows.
const path = require('path');
const root = path.join(__dirname, '..');
const { startMongo, stopMongo } = require(path.join(root, 'tests/helpers'));
jest.setTimeout(120000);
beforeAll(startMongo); afterAll(stopMongo);
const stageOf = (p) => { const s = []; (function walk(n) { if (!n) return; s.push(n.stage); walk(n.inputStage); (n.inputStages || []).forEach(walk); })(p.queryPlanner.winningPlan); return s.join('>'); };
test('plan sweeps and the review queue read through indexes', async () => {
  const m = require(path.join(root, 'src/modules/service-plan/plan.model'));
  await Promise.all([m.PlanVisit.init(), m.PlanSubscription.init(), m.ServicePlan.init()]);
  const out = {
    sweep: stageOf(await m.PlanVisit.find({ status: 'scheduled', at: { $lt: new Date() } }).limit(500).explain()),
    end: stageOf(await m.PlanSubscription.find({ status: 'active', endDay: { $lt: '2026-10-29' } }).explain()),
    review: stageOf(await m.ServicePlan.find({ status: 'pending' }).sort({ updatedAt: 1 }).limit(100).explain()),
  };
  Object.values(out).forEach((s) => expect(s).toMatch(/IXSCAN/));
});
