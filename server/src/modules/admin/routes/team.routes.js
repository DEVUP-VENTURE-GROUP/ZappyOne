const express = require('express');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const { validate } = require('../../../middlewares/validate');
const Admin = require('../admin.model');
const auditService = require('../audit.service');
const { AREAS, ROLES, permissionsOf, visibleAreas, can } = require('../access/permissions');
const { invalidate } = require('../access/guard');

/**
 * The admin team: who is signed in, and (super admins only) who else is on it.
 *
 * Guard rails that hold whatever the UI does:
 *   - nobody changes their own role or deactivates themselves
 *   - the last active super admin cannot be demoted or deactivated
 */
const router = express.Router();

const PERMISSION = Joi.string().pattern(new RegExp(`^(${Object.keys(AREAS).join('|')}):(read|write|\\*)$`));
const scopeSchema = Joi.object({
  markets: Joi.array().items(Joi.string().uppercase().length(2)).max(50),
  cities: Joi.array().items(Joi.string().trim().max(80)).max(200),
});
const view = (a) => ({
  id: String(a._id), name: a.name, email: a.email, role: a.role, permissions: a.permissions || [],
  scope: a.scope || { markets: [], cities: [] }, isActive: a.isActive, lastLoginAt: a.lastLoginAt || null,
});

/** The signed-in admin, with what they may open — the console hides the rest. */
router.get('/me', (req, res) => {
  const a = req.admin;
  res.json({
    admin: view(a),
    areas: visibleAreas(a),
    writable: Object.keys(AREAS).filter((area) => can(a, area, 'write')),
    permissions: [...permissionsOf(a)],
  });
});

router.get('/admins/roles', (req, res) => {
  res.json({
    roles: Object.entries(ROLES).map(([id, r]) => ({ id, label: r.label, permissions: r.permissions })),
    areas: Object.entries(AREAS).map(([id, label]) => ({ id, label })),
  });
});

router.get('/admins', async (req, res, next) => {
  try {
    const admins = await Admin.find().sort({ createdAt: 1 }).lean();
    res.json({ admins: admins.map(view) });
  } catch (err) { next(err); }
});

router.post('/admins', validate(Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(12).max(128).required(),
  role: Joi.string().valid(...Object.keys(ROLES)).required(),
  permissions: Joi.array().items(PERMISSION).max(40).default([]),
  scope: scopeSchema.default({ markets: [], cities: [] }),
})), async (req, res, next) => {
  try {
    if (await Admin.exists({ email: req.body.email })) {
      return res.status(409).json({ error: 'An admin with this email already exists', code: 'ADMIN_EXISTS' });
    }
    const admin = await Admin.create({
      ...req.body, password: undefined, passwordHash: await bcrypt.hash(req.body.password, 12), createdBy: req.admin._id,
    });
    await auditService.fromRequest(req, 'admin.team_create', { kind: 'admin', id: admin._id }, null, { email: admin.email, role: admin.role });
    res.status(201).json({ admin: view(admin.toObject()) });
  } catch (err) { next(err); }
});

async function isLastSuperAdmin(id) {
  const others = await Admin.countDocuments({ _id: { $ne: id }, role: 'super_admin', isActive: true });
  return others === 0;
}

router.patch('/admins/:id', validate(Joi.object({
  role: Joi.string().valid(...Object.keys(ROLES)),
  permissions: Joi.array().items(PERMISSION).max(40),
  scope: scopeSchema,
  isActive: Joi.boolean(),
}).min(1)), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^[a-f0-9]{24}$/i.test(id)) return res.status(400).json({ error: 'Invalid admin id' });
    const before = await Admin.findById(id).lean();
    if (!before) return res.status(404).json({ error: 'Admin not found' });

    const self = String(req.admin._id) === String(id);
    if (self && (req.body.role || req.body.isActive === false)) {
      return res.status(409).json({ error: 'You cannot change your own role or deactivate yourself', code: 'SELF_CHANGE' });
    }
    const losesSuper = before.role === 'super_admin' && before.isActive
      && ((req.body.role && req.body.role !== 'super_admin') || req.body.isActive === false);
    if (losesSuper && await isLastSuperAdmin(id)) {
      return res.status(409).json({ error: 'There must always be at least one active super admin', code: 'LAST_SUPER_ADMIN' });
    }

    const updated = await Admin.findByIdAndUpdate(id, { $set: req.body }, { new: true, runValidators: true }).lean();
    invalidate(id);
    await auditService.fromRequest(req, 'admin.team_update', { kind: 'admin', id }, view(before), view(updated));
    res.json({ admin: view(updated) });
  } catch (err) { next(err); }
});

module.exports = router;
