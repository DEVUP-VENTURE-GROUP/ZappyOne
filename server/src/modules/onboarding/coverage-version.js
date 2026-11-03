// One number that changes whenever what is bookable where may have changed. Coverage, the live catalog and search key their caches on it, so a provider approved, priced, moved or switched online shows on the next request instead of after the cache runs out.
const { redis } = require('../../config/redis');

const KEY = 'coverage:ver';
// Read at most once a second per process: a busy home page costs one Redis GET a second, not one per visit.
const LOCAL_MS = 1000;
let local = { v: '0', at: 0 };

async function current() {
  if (Date.now() - local.at < LOCAL_MS) return local.v;
  try { local = { v: String((await redis.get(KEY)) || '0'), at: Date.now() }; } catch { /* keep the last known */ }
  return local.v;
}

function bump() {
  local.at = 0;
  return redis.incr(KEY).catch(() => {});
}

const touched = (update, fields) => {
  if (!update) return false;
  const keys = [...Object.keys(update), ...Object.values(update).flatMap((v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : []))];
  return keys.some((k) => fields.some((f) => k === f || k.startsWith(`${f}.`)));
};

/**
 * Bump on every write to this model; with `fields`, only when one of them changes
 * (a pro's location heartbeat must not throw every cache away).
 */
function watch(schema, { fields = null } = {}) {
  schema.pre('save', function mark() { this.$locals.coverageChanged = !fields || this.isNew || fields.some((f) => this.isModified(f)); });
  schema.post('save', function after() { if (this.$locals.coverageChanged) bump(); });
  const queryOps = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'];
  schema.post(queryOps, function after() { if (!fields || touched(this.getUpdate(), fields)) bump(); });
  if (!fields) {
    schema.post(['deleteOne', 'deleteMany', 'findOneAndDelete'], () => { bump(); });
    schema.post('insertMany', () => { bump(); });
  }
}

module.exports = { current, bump, watch };
