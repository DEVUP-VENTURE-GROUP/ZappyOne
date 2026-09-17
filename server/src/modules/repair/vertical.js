/**
 * Which repair vertical a request is operating on.
 *
 * The repair engine is generic; the vertical is data. Controllers previously
 * pinned `const VERTICAL = 'mobile'`, which meant a second vertical could only
 * exist by copying the whole module — exactly what §91 forbids.
 *
 * Resolution order is query → body → route param, defaulting to 'mobile' so
 * every existing mobile client keeps working untouched without sending the
 * parameter at all.
 *
 * The value is checked against an allowlist rather than trusted: it reaches
 * Mongo filters directly, so an unvalidated string would let a caller read
 * across verticals — or inject an object through query-string parsing.
 */

/** Verticals the repair engine currently serves. */
const VERTICALS = ['mobile', 'laptop', 'two_wheeler', 'four_wheeler', 'water_tank_care'];

const DEFAULT_VERTICAL = 'mobile';

/**
 * A filter that matches one vertical, tolerating rows written before the
 * field existed.
 *
 * Mobile catalog rows predate `vertical`, so a bare equality match would hide
 * every one of them and empty the mobile catalog. The default vertical
 * therefore also matches "field absent"; verticals added since match strictly.
 */
function verticalFilter(vertical) {
  if (vertical !== DEFAULT_VERTICAL) return { vertical };
  return { $or: [{ vertical: DEFAULT_VERTICAL }, { vertical: { $exists: false } }, { vertical: null }] };
}

function isValid(v) {
  return typeof v === 'string' && VERTICALS.includes(v.toLowerCase());
}

/** The vertical for this request, guaranteed to be one of VERTICALS. */
function verticalOf(req) {
  const raw = req?.query?.vertical ?? req?.body?.vertical ?? req?.params?.vertical;
  if (isValid(raw)) return String(raw).toLowerCase();
  return DEFAULT_VERTICAL;
}

/**
 * Express guard for routes where guessing the vertical would be wrong — an
 * explicit but unrecognised value is rejected rather than silently treated as
 * mobile, which would quietly return the wrong catalog.
 */
function requireKnownVertical(req, res, next) {
  const raw = req?.query?.vertical ?? req?.body?.vertical ?? req?.params?.vertical;
  if (raw != null && raw !== '' && !isValid(raw)) {
    return res.status(400).json({
      error: `Unknown vertical "${raw}"`,
      code: 'UNKNOWN_VERTICAL',
      supported: VERTICALS,
    });
  }
  return next();
}

module.exports = {
  VERTICALS, DEFAULT_VERTICAL, verticalOf, isValid, requireKnownVertical, verticalFilter,
};
