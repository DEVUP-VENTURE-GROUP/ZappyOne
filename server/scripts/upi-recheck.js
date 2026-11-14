// Checks every saved UPI ID that has no verified name yet, once Razorpay has switched UPI checks on. Never deletes: IDs that do not exist are only listed.
//   node scripts/upi-recheck.js          (lists what it would store)
//   node scripts/upi-recheck.js --apply  (stores the verified names; needs --yes-production on production)
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  const apply = process.argv.includes('--apply');
  if (apply && process.env.NODE_ENV === 'production' && !process.argv.includes('--yes-production')) {
    console.error('[upi-recheck] refusing to change PRODUCTION data without --yes-production');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const { checkUpi } = require('../src/modules/payment/upi-check');
  const tally = { verified: 0, invalid: 0, unchecked: 0 };
  for (const [label, Model] of [['pro', require('../src/modules/worker/worker.model')], ['shop', require('../src/modules/shop/shop.model')]]) {
    const cursor = Model.find({ savedUpiIds: { $elemMatch: { $or: [{ verifiedName: '' }, { verifiedName: { $exists: false } }] } } }).select('savedUpiIds').lean().cursor();
    for await (const owner of cursor) {
      for (const u of owner.savedUpiIds.filter((x) => !x.verifiedName)) {
        const r = await checkUpi(u.upiId);
        tally[r.status] += 1;
        if (r.reason === 'not_enabled') { console.log('[upi-recheck] Razorpay has not switched UPI checks on yet: nothing to do'); await mongoose.disconnect(); return; }
        console.log(`   ${label} ${owner._id} ${u.upiId}: ${r.status}${r.name ? ` (${r.name})` : ''}`);
        if (apply && r.status === 'verified' && r.name) {
          await Model.updateOne({ _id: owner._id, 'savedUpiIds._id': u._id }, { $set: { 'savedUpiIds.$.verifiedName': r.name, 'savedUpiIds.$.verifiedAt': new Date() } });
        }
        await new Promise((ok) => setTimeout(ok, 250));
      }
    }
  }
  console.log(`[upi-recheck] verified ${tally.verified}, do not exist ${tally.invalid}, could not check ${tally.unchecked}${apply ? '' : ' (nothing stored: add --apply)'}`);
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
