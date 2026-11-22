const mongoose = require('mongoose');
// Run on the server: dry run by default (prints a report, writes nothing); --apply writes; production also needs --yes-production.
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });
const overlay = path.join(root, `.env.${process.env.NODE_ENV || 'development'}`);
if (fs.existsSync(overlay)) require('dotenv').config({ path: overlay, override: true });
const apply = process.argv.includes('--apply');
if (apply && process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) { console.error('Refusing to write to production without --yes-production'); process.exit(1); }
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 })
  .then(() => require('../src/modules/onboarding/private-requests').makeRequestedPrivate({ apply }))
  .then((r) => { console.log(JSON.stringify(r, null, 2)); return mongoose.disconnect(); })
  .then(() => process.exit(0))
  .catch((e) => { console.error('[requested-services-private] failed:', e.message); process.exit(1); });
