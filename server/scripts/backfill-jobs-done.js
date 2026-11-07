// Counts done jobs from before the jobs-done counter (jobs/job-count) onto shop and pro profiles. Safe to run again.
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await require('../src/config/mongo').connectMongo();
  const added = await require('../src/modules/jobs/job-count').backfill();
  console.log(`Jobs done added: shops ${added.shop}, pros ${added.worker}`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
