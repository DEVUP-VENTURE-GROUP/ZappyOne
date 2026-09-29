'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const ZIUser = require('../models/ZIUser');

// ── Permission map ──────────────────────────────────────────────────────────
// '*' means all permissions. For city_manager, ':own' suffix means data is
// filtered to their cityScope. The auth middleware injects req.scopedCityId.
const PERMISSIONS = {
  super_admin: ['*'],
  zi_admin: [
    'command:read', 'command:write',
    'expansion:read', 'expansion:write', 'expansion:approve',
    'fraud:read', 'fraud:write', 'fraud:review',
    'pricing:read', 'pricing:write',
    'partner:intel:read', 'partner:intel:write',
    'worker:intel:read', 'worker:intel:write',
    'investor:read',
    'ai:read', 'ai:write',
    'ads:read', 'ads:write', 'ads:approve',
    'simulator:read', 'simulator:write',
    'forecast:read', 'forecast:write',
    'heatmap:read', 'heatmap:write',
    'boardroom:read',
    'audit:read',
  ],
  analyst: [
    'command:read',
    'expansion:read',
    'forecast:read',
    'heatmap:read',
    'partner:intel:read',
    'worker:intel:read',
    'investor:read',
    'ads:read',
    'simulator:read',
    'fraud:read',
  ],
  city_manager: [
    'command:read:own',
    'expansion:read',
    'partner:intel:read:own',
    'worker:intel:read:own',
    'heatmap:read:own',
    'forecast:read:own',
  ],
  board_member: [
    'investor:read',
    'boardroom:read',
    'forecast:read',
    'command:read',
  ],
};

/**
 * Checks if a role has a given permission.
 * Supports wildcard '*' for super_admin and ':own' suffix for city-scoped access.
 */
function hasPermission(role, requiredPermission) {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;

  // super_admin wildcard
  if (rolePerms.includes('*')) return true;

  // Exact match
  if (rolePerms.includes(requiredPermission)) return true;

  // ':own' variant — city_manager has read:own which satisfies read for their city
  // e.g. 'command:read:own' satisfies 'command:read' when city is scoped
  const ownVariant = requiredPermission + ':own';
  if (rolePerms.includes(ownVariant)) return true;

  // Wildcard suffix check: 'expansion:*' satisfies 'expansion:read', 'expansion:write' etc.
  for (const perm of rolePerms) {
    if (perm.endsWith(':*')) {
      const prefix = perm.slice(0, -2); // remove ':*'
      if (requiredPermission.startsWith(prefix + ':') || requiredPermission === prefix) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Express middleware factory.
 * Usage: router.get('/path', ziAuth('command:read'), controller)
 */
function ziAuth(requiredPermission) {
  return async function ziAuthMiddleware(req, res, next) {
    try {
      const token = req.headers['x-zi-token'];

      if (!token) {
        return res.status(401).json({
          error: 'Missing ZI token',
          code: 'ZI_TOKEN_MISSING',
        });
      }

      const secret = process.env.ZI_JWT_SECRET;
      if (!secret) {
        return res.status(500).json({
          error: 'ZI authentication not configured',
          code: 'ZI_SECRET_MISSING',
        });
      }

      let payload;
      try {
        payload = jwt.verify(token, secret);
      } catch (jwtErr) {
        if (jwtErr.name === 'TokenExpiredError') {
          return res.status(401).json({
            error: 'ZI token expired',
            code: 'ZI_TOKEN_EXPIRED',
          });
        }
        return res.status(401).json({
          error: 'Invalid ZI token',
          code: 'ZI_TOKEN_INVALID',
        });
      }

      // Load user from DB — validates the user is still active
      const user = await ZIUser.findById(payload.userId).select(
        'email role cityScope isActive permissions'
      );

      if (!user) {
        return res.status(401).json({
          error: 'ZI user not found',
          code: 'ZI_USER_NOT_FOUND',
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          error: 'ZI account is deactivated',
          code: 'ZI_ACCOUNT_INACTIVE',
        });
      }

      // Permission check
      const allowed =
        hasPermission(user.role, requiredPermission) ||
        (user.permissions && user.permissions.includes(requiredPermission));

      if (!allowed) {
        return res.status(403).json({
          error: `Insufficient permission: ${requiredPermission}`,
          code: 'ZI_PERMISSION_DENIED',
          required: requiredPermission,
          role: user.role,
        });
      }

      // Attach to request
      req.ziUser = {
        id: user._id,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
      };

      // City-scoped access: inject cityId into request for downstream filtering
      if (user.role === 'city_manager' && user.cityScope) {
        req.scopedCityId = user.cityScope.toString();
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * POST /zi/v1/auth/login
 * Body: { email, password }
 * Returns: { token, user }
 */
async function ziLogin(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        code: 'ZI_LOGIN_MISSING_FIELDS',
      });
    }

    const user = await ZIUser.findOne({ email: email.toLowerCase().trim(), isActive: true })
      .select('+passwordHash');

    if (!user) {
      // Timing-safe: still do a bcrypt compare to avoid user enumeration
      await bcrypt.compare(password, '$2b$12$invalidhashplaceholder000000000000000000000000000');
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'ZI_LOGIN_INVALID',
      });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'ZI_LOGIN_INVALID',
      });
    }

    const secret = process.env.ZI_JWT_SECRET;
    if (!secret) {
      return res.status(500).json({
        error: 'ZI authentication not configured',
        code: 'ZI_SECRET_MISSING',
      });
    }

    const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: user.role,
    };

    if (user.role === 'city_manager' && user.cityScope) {
      tokenPayload.cityScope = user.cityScope;
    }

    const token = jwt.sign(tokenPayload, secret, {
      expiresIn: process.env.ZI_JWT_EXPIRY || '12h',
      issuer: 'zappy-zi',
      audience: 'zi-platform',
    });

    // Update lastLogin and push IP
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    await ZIUser.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
      $push: { loginIps: { $each: [{ ip, ts: new Date() }], $slice: -50 } },
    });

    return res.json({
      token,
      expiresIn: process.env.ZI_JWT_EXPIRY || '12h',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        cityScope: user.cityScope || null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /zi/v1/auth/register
 * Requires super_admin auth (call ziAuth('*') before this).
 * Body: { email, password, role, cityScope? }
 * Creates a new ZI platform user.
 */
async function ziRegister(req, res, next) {
  try {
    const { email, password, role, cityScope } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        error: 'email, password, and role are required',
        code: 'ZI_REGISTER_MISSING_FIELDS',
      });
    }

    const { ZI_ROLES } = require('../models/ZIUser');
    if (!ZI_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${ZI_ROLES.join(', ')}`,
        code: 'ZI_REGISTER_INVALID_ROLE',
      });
    }

    if (role === 'city_manager' && !cityScope) {
      return res.status(400).json({
        error: 'cityScope is required for city_manager role',
        code: 'ZI_REGISTER_MISSING_CITY_SCOPE',
      });
    }

    const existing = await ZIUser.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({
        error: 'A ZI user with that email already exists',
        code: 'ZI_REGISTER_DUPLICATE',
      });
    }

    if (password.length < 12) {
      return res.status(400).json({
        error: 'Password must be at least 12 characters',
        code: 'ZI_REGISTER_WEAK_PASSWORD',
      });
    }

    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await ZIUser.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      role,
      cityScope: cityScope || null,
      createdBy: req.ziUser ? req.ziUser.id : null,
    });

    return res.status(201).json({
      message: 'ZI user created successfully',
      user: {
        id: newUser._id,
        email: newUser.email,
        role: newUser.role,
        cityScope: newUser.cityScope || null,
        createdAt: newUser.createdAt,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { ziAuth, ziLogin, ziRegister, PERMISSIONS, hasPermission };
