// A unique index left in the database after its field left the schema blocks every new record (all of them read as null). Lists every stale index; drops only the stale unique ones. Data is never touched.
//   node scripts/drop-stale-unique-indexes.js          (lists only)
//   node scripts/drop-stale-unique-indexes.js --apply  (drops the stale unique ones)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const IS_MODEL = /\.models?\.js$|[\\/]models[\\/][^\\/]+\.js$/;

// A model defined in two files is skipped: its indexes cannot be judged against one schema.
function loadModels(dir = path.join(__dirname, '../src'), twice = new Set()) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) loadModels(p, twice);
    else if (IS_MODEL.test(p)) {
      try { require(p); } catch (err) {
        if (err.name !== 'OverwriteModelError') throw err;
        twice.add(String(err.message).match(/`([^`]+)`/)?.[1]);
      }
    }
  }
  return twice;
}

async function run({ apply = false, log = console.log } = {}) {
  const twice = loadModels();
  for (const name of twice) log(`${name}: defined in two files, skipped`);
  const dropped = [];
  for (const Model of Object.values(mongoose.models)) {
    if (twice.has(Model.modelName)) continue;
    let toDrop;
    try { ({ toDrop } = await Model.diffIndexes()); } catch (e) { if (e.codeName === 'NamespaceNotFound') continue; throw e; }
    if (!toDrop.length) continue;
    const live = await Model.collection.indexes();
    for (const name of toDrop) {
      const ix = live.find((i) => i.name === name);
      const blocking = ix?.unique && !ix.partialFilterExpression && !ix.sparse;
      log(`${Model.collection.name}.${name}${ix?.unique ? ' (unique)' : ''}: not in the schema${blocking ? (apply ? ', dropped' : ', would drop') : ', left alone'}`);
      if (blocking && apply) { await Model.collection.dropIndex(name); dropped.push(`${Model.collection.name}.${name}`); }
    }
  }
  return dropped;
}

if (require.main === module) {
  (async () => {
    const { connectMongo } = require('../src/config/mongo');
    await connectMongo();
    await run({ apply: process.argv.includes('--apply') });
    await mongoose.disconnect();
    process.exit(0);
  })().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { run };
