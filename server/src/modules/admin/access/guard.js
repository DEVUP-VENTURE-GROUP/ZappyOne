const Admin = require('../admin.model');
const { areaFor, can } = require('./permissions');

/**
 * Loads the signed-in admin on every admin request and checks the path's area.
 *
 * Read from the database (with a short cache), not from the token: a role
 * change or a deactivation takes effect within CACHE_MS, not when the token
 * happens to expire.
 */
const CACHE_MS = 30_000;
const cache = new Map();

async function loadAdmin(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.admin;
  const admin = await Admin.findById(id).select('name email role permissions scope isActive').lean();
  cache.set(id, { at: Date.now(), admin });
  return admin;
}

/** Forget a cached admin — called when their role, scope or status changes. */
function invalidate(id) { cache.delete(String(id)); }

function adminAccess() {
  return async (req, res, next) => {
    try {
      const admin = await loadAdmin(String(req.auth.sub));
      if (!admin || !admin.isActive) return res.status(401).json({ error: 'This admin account is not active', code: 'ADMIN_INACTIVE' });
      req.admin = admin;

      // Your own profile and permissions are always yours to read.
      if (req.path === '/me' && req.method === 'GET') return next();

      const area = areaFor(req.path);
      const action = req.method === 'GET' || req.method === 'HEAD' ? 'read' : 'write';
      // No rule: super admin only, so a new endpoint is closed by default.
      const allowed = area ? can(admin, area, action) : can(admin, '*', action);
      if (!allowed) {
        return res.status(403).json({
          error: 'Your role does not allow this', code: 'ADMIN_FORBIDDEN', area: area || 'unmapped', action,
        });
      }
      next();
    } catch (err) { next(err); }
  };
}

module.exports = { adminAccess, invalidate };
