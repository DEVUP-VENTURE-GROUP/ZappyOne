/**
 * What each side of a job may see about the other, and when.
 *
 * The rule is "only what the job needs, only while it needs it":
 *
 *   before a provider accepts   providers see the AREA (locality, city) and a
 *                               point rounded to about a kilometre, never the
 *                               house, flat or exact pin. Distance is worked
 *                               out on the server from the exact point.
 *   while the job is active      the assigned provider sees the full address;
 *                               the customer sees the provider's name and number.
 *   once it is finished          both sides keep a record of the job, but the
 *                               address shrinks back to the area and the phone
 *                               number is no longer shown.
 */

const HOUSE_WORDS = /\b(flat|house|h\.?\s?no|door|plot|block|tower|floor|apt|apartment|wing|room|no\.?)\b/i;
const DROP = /^(india|telangana|andhra pradesh|ts|tg)$/i;

/** "Flat 2B, Sri Sai Residency, Road 5, Madhapur, Hyderabad, Telangana 500081" -> "Madhapur, Hyderabad". */
function areaOf(address) {
  const parts = String(address || '').split(',').map((s) => s.trim()).filter(Boolean);
  const kept = parts.filter((p) => !/\d/.test(p) && !HOUSE_WORDS.test(p) && !DROP.test(p));
  // Nothing safe to show (an address that is all house details) says nothing rather than too much.
  return kept.slice(-2).join(', ');
}

/** A [lng, lat] pin rounded to two decimals (~1 km), for showing roughly where a job is. */
function roughCoords(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  return coords.map((v) => Math.round(Number(v) * 100) / 100);
}

/** First name and an initial: "Ravi Kumar" -> "Ravi K." */
function shortName(name, fallback = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

/** A location reduced to what someone without the job may see. */
function areaOnly(loc) {
  if (!loc) return loc;
  return {
    address: areaOf(loc.address),
    ...(loc.cityCode ? { cityCode: loc.cityCode } : {}),
    ...(loc.coordinates ? { coordinates: roughCoords(loc.coordinates) } : {}),
  };
}

module.exports = { areaOf, roughCoords, shortName, areaOnly };
