/**
 * Small text helpers shared across modules.
 *
 * escapeRegex — MUST wrap any user- or data-supplied string before it goes into a
 * MongoDB `$regex`. Without it a query like ?search=(a+)+$ is a ReDoS, and regex
 * metacharacters silently corrupt the match. (Previously inlined in a couple of
 * admin controllers and forgotten in the service/pricing lookups.)
 *
 * slug — normalise a human string ("iPhone 15 Pro Max") to a hyphen code
 * ("iphone-15-pro-max") so it matches the stored `code` fields exactly.
 */
function escapeRegex(str) {
  return String(str == null ? '' : str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slug(str) {
  return String(str == null ? '' : str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { escapeRegex, slug };
