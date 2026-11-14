// Admin reports read from an Atlas replica, so a heavy report never slows bookings on the primary: an admin GET runs inside reportReads, and every aggregation started inside it asks for secondaryPreferred (the primary when no replica answers). Writes, and reads made by admin actions (POST, PUT), stay on the primary.
const { AsyncLocalStorage } = require('async_hooks');
const mongoose = require('mongoose');

const store = new AsyncLocalStorage();
const exec = mongoose.Aggregate.prototype.exec;
mongoose.Aggregate.prototype.exec = function execOnReplica(...args) {
  if (store.getStore() && !this.options?.readPreference) this.read('secondaryPreferred');
  return exec.apply(this, args);
};

function reportReads(req, res, next) {
  if (req.method !== 'GET') return next();
  return store.run(true, next);
}

const inReport = () => !!store.getStore();

module.exports = { reportReads, inReport, run: (fn) => store.run(true, fn) };
