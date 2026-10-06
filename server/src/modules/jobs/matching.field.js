const mongoose = require('mongoose');

/** When the finding-someone waves fired for this job (jobs/waves), so each fires once. */
module.exports = new mongoose.Schema({
  offlineWaveAt: { type: Date, default: null },
  slowNoticeAt: { type: Date, default: null },
}, { _id: false });
