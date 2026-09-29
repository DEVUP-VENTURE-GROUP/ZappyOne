'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ZIUser = require('../models/ZIUser');

function signToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email, role: user.role, cityScope: user.cityScope },
    process.env.ZI_JWT_SECRET, // required — throws if undefined (intentional: misconfiguration must be loud)
    { expiresIn: '8h' }
  );
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const user = await ZIUser.findOne({ email: email.toLowerCase(), isActive: true }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    user.lastLogin = new Date();
    user.loginIps = [{ ip, ts: new Date() }, ...(user.loginIps || [])].slice(0, 20);
    await user.save();

    const token = signToken(user);
    res.json({
      success: true,
      token,
      user: { id: user._id, email: user.email, role: user.role, cityScope: user.cityScope },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function register(req, res) {
  try {
    const { email, password, role, cityScope } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({ success: false, message: 'email, password, and role required' });
    }

    const validRoles = ['super_admin', 'zi_admin', 'analyst', 'city_manager', 'board_member'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const exists = await ZIUser.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ success: false, message: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await ZIUser.create({
      email: email.toLowerCase(),
      passwordHash,
      role,
      cityScope: cityScope || null,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      user: { id: user._id, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function me(req, res) {
  try {
    const user = await ZIUser.findById(req.ziUser.id).select('-passwordHash -mfaSecret');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function listUsers(req, res) {
  try {
    const users = await ZIUser.find({}).select('-passwordHash -mfaSecret').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function deactivateUser(req, res) {
  try {
    const { id } = req.params;
    if (id === String(req.ziUser.id)) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' });
    }
    await ZIUser.findByIdAndUpdate(id, { isActive: false });
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { login, register, me, listUsers, deactivateUser };
