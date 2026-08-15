const mongoose = require('mongoose');
const config   = require('./index');
const logger   = require('../utils/logger');

// Track connection state so health checks and request handlers can bail fast.
let _isConnected = false;
let _reconnecting = false;

const MONGO_OPTS = {
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS:          45_000,
  heartbeatFrequencyMS:     10_000,
  maxPoolSize:              50,
  minPoolSize:              5,
};

/**
 * Connect to MongoDB with automatic reconnect-on-disconnect.
 * Uses exponential back-off (max 30s) so a transient outage doesn't spin
 * the process at 100% CPU. (#91)
 */
async function connectMongo() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongo.uri, MONGO_OPTS);
  _isConnected = true;
  logger.info('MongoDB connected');
  _attachListeners();
}

function _attachListeners() {
  mongoose.connection.off('error',        _onError);        // prevent duplicate listeners on reconnect
  mongoose.connection.off('disconnected', _onDisconnected);
  mongoose.connection.off('reconnected',  _onReconnected);

  mongoose.connection.on('error',        _onError);
  mongoose.connection.on('disconnected', _onDisconnected);
  mongoose.connection.on('reconnected',  _onReconnected);
}

function _onError(err) {
  logger.error({ err: err.message }, '[MONGO] Connection error');
}

function _onReconnected() {
  _isConnected = true;
  _reconnecting = false;
  logger.info('[MONGO] Reconnected');
}

function _onDisconnected() {
  _isConnected = false;
  logger.warn('[MONGO] Disconnected — attempting reconnect with backoff');
  _scheduleReconnect(1000);
}

function _scheduleReconnect(delayMs) {
  if (_reconnecting) return;
  _reconnecting = true;
  setTimeout(async () => {
    try {
      await mongoose.connect(config.mongo.uri, MONGO_OPTS);
      _reconnecting = false;
    } catch (err) {
      logger.warn({ err: err.message, nextRetryMs: Math.min(delayMs * 2, 30_000) }, '[MONGO] Reconnect failed — retrying');
      _reconnecting = false;
      _scheduleReconnect(Math.min(delayMs * 2, 30_000)); // exponential back-off, cap 30s
    }
  }, delayMs);
}

/** Returns false when Mongo is disconnected — used by health check and middleware. */
function isMongoConnected() { return _isConnected; }

/**
 * Express middleware: returns 503 immediately if Mongo is down.
 * Prevents requests from hanging indefinitely. (#91)
 */
function requireMongo(req, res, next) {
  // Gate on the actual driver state as well as our flag. `_isConnected` is only
  // set on the connectMongo() path; `readyState === 1` is authoritative for any
  // live connection (including ones opened directly, e.g. in tests), so the
  // guard reflects real reachability instead of assuming a single connect path.
  const connected = _isConnected || mongoose.connection.readyState === 1;
  if (!connected) {
    return res.status(503).json({
      error: 'Service temporarily unavailable. Please try again in a moment.',
      code: 'DB_UNAVAILABLE',
    });
  }
  next();
}

module.exports = { connectMongo, isMongoConnected, requireMongo };
