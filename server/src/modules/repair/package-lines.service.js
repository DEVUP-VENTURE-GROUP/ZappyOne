// A whole fixed-price service line from one definition (name, domain, what the customer picks, packages with starting prices): the same catalog rows a seed file writes, built inside the server so admin and approved provider proposals can open any service.
const { httpError } = require('../../core/errors');
const { packageVertical, toCode } = require('./seed/wash.seed');
const { applySeed } = require('./seed/run-vertical-seed');
const { seedBands } = require('./seed/run-pricing-seed');
const { register, BUILT_IN } = require('./vertical');
const { SERVICE_MODES } = require('./service-modes');

const CODE = /^[a-z][a-z0-9_]{2,40}$/;
const SHORT = /^[a-z0-9_]{1,30}$/;
const kebab = (s) => s.replace(/_/g, '-');
const prefixOf = (code) => code.split('_').map((w) => w.slice(0, 3)).join('').slice(0, 8);

function check(def) {
  const bad = (msg) => httpError(msg, 400, 'BAD_SERVICE');
  if (!CODE.test(def.code || '')) throw bad('The service code must be lowercase letters, numbers and underscores.');
  if (BUILT_IN.includes(def.code)) throw bad('That code belongs to a built-in service.');
  if (!def.name || !def.domainCode) throw bad('A service needs a name and a domain.');
  const types = def.types?.length ? def.types : [{ code: 'one', name: def.typeName || 'Standard' }];
  if (types.length > 12 || types.some((t) => !SHORT.test(t.code) || !t.name)) throw bad('Each option needs a short code and a name, at most 12.');
  if (!def.packages?.length || def.packages.length > 30) throw bad('Add between 1 and 30 packages.');
  for (const p of def.packages) {
    if (!SHORT.test(p.code) || !p.name) throw bad('Each package needs a short code and a name.');
    if (!(p.minutes > 0 && p.minutes <= 24 * 60)) throw bad(`Set how long "${p.name}" takes.`);
    for (const t of types) if (!(Number(p.prices?.[t.code]) > 0)) throw bad(`"${p.name}" needs a starting price for ${t.name}.`);
    if (p.modes && p.modes.some((m) => !SERVICE_MODES.includes(m))) throw bad(`"${p.name}" has an unknown way of doing the job.`);
  }
  return types;
}

// Idempotent: re-running a definition adds new packages and keeps every admin edit (the seed steps only insert).
async function upsertPackageLine(def, { status = 'live' } = {}) {
  const types = check(def);
  const { ServiceLine } = require('../onboarding/onboarding.model');
  const vertical = register(def.code);
  const pv = packageVertical({
    vertical, prefix: def.prefix || prefixOf(vertical), label: def.typeWord || 'Option', group: 'jobs', qaCode: 'job',
    skill: def.skill || { name: def.name, description: def.description || '' },
    qa: def.qa?.length ? def.qa : [{ code: 'before_after_photos', label: 'Before and after photos taken', required: true }, { code: 'customer_ok', label: 'Customer checked the work and said it is done', required: true }],
    types, packages: def.packages, modes: def.modes?.length ? def.modes : ['doorstep'],
  });
  await applySeed(vertical, { data: pv.data, FLOWS: [], models: { ...pv.models, toCode } });
  await seedBands(pv.PRICING, vertical);
  const line = await ServiceLine.findOneAndUpdate(
    { code: def.code },
    {
      $setOnInsert: {
        code: def.code, name: def.name, domainCode: def.domainCode, description: def.description || '', icon: def.icon || 'Wrench',
        tagline: def.tagline || '', isPopular: !!def.isPopular, displayOrder: def.displayOrder || 50, status,
        providerKinds: def.providerKinds?.length ? def.providerKinds : ['shop', 'individual'],
      },
      $set: { repairVertical: vertical, customerPath: `/repair/${kebab(vertical)}`, typeWord: def.typeWord || '', thing: def.thing || 'job', packageDef: { ...def, types } },
    },
    { upsert: true, new: true },
  ).lean();
  return line;
}

module.exports = { upsertPackageLine, check };
