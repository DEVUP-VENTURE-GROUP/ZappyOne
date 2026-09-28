/**
 * Request timeout middleware.
 * Kills any request that hasn't responded within `ms` milliseconds.
 * Prevents slow MongoDB queries or external API calls from hanging
 * the Node.js thread pool indefinitely.
 *
 * Exceptions:
 *  - WebSocket upgrade requests (socket.io)
 *  - Cashfree webhook route (needs raw body, no timeout interference)
 *  - Health check (always fast)
 */

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

function timeoutMiddleware(ms = DEFAULT_TIMEOUT_MS) {
  return (req, res, next) => {
    // Skip socket upgrade and long-poll paths
    if (req.headers.upgrade === 'websocket') return next();
    if (req.path.startsWith('/socket.io')) return next();

    const timer = setTimeout(() => {
      if (res.headersSent) return; // already responded, nothing to do
      res.status(503).json({
        error: 'Request timed out. The server took too long to respond. Please try again.',
        code: 'REQUEST_TIMEOUT',
        requestId: req.id,
      });
    }, ms);

    // Clear the timer as soon as the response finishes
    res.on('finish', () => clearTimeout(timer));
    res.on('close',  () => clearTimeout(timer));

    next();
  };
}

module.exports = { timeoutMiddleware };
