/**
 * Opening a document in the phone's browser (receipts, invoices, the service
 * report), which cannot send the app's sign-in header.
 *
 * The app asks for a link to one document; the token in it is good for five
 * minutes, only for a GET of that exact path, and only as that person. It is
 * signed with its own key, so it can never pass as a sign-in token, and the
 * document's own handler still checks the person may see it.
 */
const jwt = require('jsonwebtoken');
const config = require('../../config');

const TTL = '5m';
const key = () => `${config.jwt.secret}:doc-link`;
const ID = '[a-f0-9]{24}';
/** The only documents a link can open. */
const DOCUMENTS = [
  new RegExp(`^/api/jobs/${ID}/receipt$`),
  new RegExp(`^/api/repair/bookings/${ID}/report$`),
  new RegExp(`^/api/orders/${ID}/invoice$`),
  /^\/api\/shops\/me\/statement\/\d{4}-\d{2}\.csv$/,
];

const isDocument = (path) => DOCUMENTS.some((re) => re.test(path));

function sign({ sub, role, sid }, path) {
  return jwt.sign({ sub, role, ...(sid && { sid }), path, typ: 'doc' }, key(), { expiresIn: TTL });
}

/** The person a link was made for, when it is valid for this exact path; otherwise null. */
function verify(token, path) {
  try {
    const p = jwt.verify(String(token), key());
    if (p.typ !== 'doc' || p.path !== path || !isDocument(path)) return null;
    return { sub: p.sub, role: p.role, ...(p.sid && { sid: p.sid }) };
  } catch { return null; }
}

module.exports = { sign, verify, isDocument };
