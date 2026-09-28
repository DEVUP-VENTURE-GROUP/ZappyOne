/**
 * An Error the error middleware turns into an HTTP response:
 * `status` becomes the response code, `code` a machine-readable reason, and
 * anything in `extra` is sent alongside for the client to act on.
 */
function httpError(message, status, code, extra = {}) {
  return Object.assign(new Error(message), { status, code, ...extra });
}

module.exports = { httpError };
