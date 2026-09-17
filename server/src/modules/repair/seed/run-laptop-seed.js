/**
 * Laptop seed — kept as an entry point, now a delegate.
 *
 * The three hundred lines that used to live here were identical to the
 * two-wheeler seeder except for which data file they imported, so they moved
 * into `run-vertical-seed.js` and this file stays only so existing runbooks,
 * scripts and muscle memory keep working.
 *
 * Usage (unchanged):
 *   NODE_ENV=development node src/modules/repair/seed/run-laptop-seed.js
 *   NODE_ENV=development node src/modules/repair/seed/run-laptop-seed.js --report
 *   NODE_ENV=production  node src/modules/repair/seed/run-laptop-seed.js --yes-production
 */

const { run, report } = require('./run-vertical-seed');

const VERTICAL = 'laptop';

function main() {
  return run(VERTICAL, {
    reportOnly: process.argv.includes('--report'),
    allowProduction: process.argv.includes('--yes-production'),
  });
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('[laptop-seed] failed:', err.message);
    process.exit(1);
  });
}

module.exports = { main, report: () => report(VERTICAL) };
