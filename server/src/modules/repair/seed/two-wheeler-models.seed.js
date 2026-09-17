/**
 * Two-wheeler model catalog.
 *
 * Real, current, high-volume Indian models only — the ones a technician
 * actually sees in a day. §90 forbids inventing model data, and a wrong model
 * produces a wrong part, so this is deliberately a SHORTLIST rather than an
 * attempt at every SKU ever sold. Anything missing arrives through admin entry
 * or a customer identification request, which is the designed path.
 *
 * `productTypeCode` is the load-bearing field: it decides which symptoms the
 * customer is shown. A scooter tagged `scooter` never gets asked about chain
 * slack; an `electric_scooter` never gets asked about spark plugs.
 *
 * No variants, no launch years beyond the generation in the name, and no
 * prices. Those are either unnecessary for choosing a repair or are the
 * provider's to state.
 */

const VERTICAL = 'two_wheeler';

const MC = 'motorcycle', SC = 'scooter', MO = 'moped';
const ES = 'electric_scooter', EM = 'electric_motorcycle';

/** `M(brand, name, type)` — the code is derived, never hand-written. */
const M = (brandCode, name, productTypeCode) => ({ brandCode, name, productTypeCode });

const MODELS = [
  /* ── Hero ──────────────────────────────────────────────────────────── */
  M('hero', 'Splendor Plus', MC),
  M('hero', 'Splendor Plus XTEC', MC),
  M('hero', 'HF Deluxe', MC),
  M('hero', 'Passion Pro', MC),
  M('hero', 'Glamour', MC),
  M('hero', 'Super Splendor', MC),
  M('hero', 'Xtreme 125R', MC),
  M('hero', 'Xtreme 160R', MC),
  M('hero', 'Xpulse 200 4V', MC),
  M('hero', 'Destini 125', SC),
  M('hero', 'Pleasure Plus', SC),
  M('hero', 'Maestro Edge 125', SC),
  M('hero', 'Xoom 110', SC),

  /* ── Honda ─────────────────────────────────────────────────────────── */
  M('honda-2w', 'Activa 6G', SC),
  M('honda-2w', 'Activa 125', SC),
  M('honda-2w', 'Dio 125', SC),
  M('honda-2w', 'Shine 125', MC),
  M('honda-2w', 'SP 125', MC),
  M('honda-2w', 'Unicorn 160', MC),
  M('honda-2w', 'Hornet 2.0', MC),
  M('honda-2w', 'CB350', MC),
  M('honda-2w', 'CB300R', MC),
  M('honda-2w', 'Livo', MC),

  /* ── TVS ───────────────────────────────────────────────────────────── */
  M('tvs', 'Jupiter 110', SC),
  M('tvs', 'Jupiter 125', SC),
  M('tvs', 'Ntorq 125', SC),
  M('tvs', 'Zest 110', SC),
  M('tvs', 'Scooty Pep Plus', SC),
  M('tvs', 'Apache RTR 160', MC),
  M('tvs', 'Apache RTR 160 4V', MC),
  M('tvs', 'Apache RTR 200 4V', MC),
  M('tvs', 'Raider 125', MC),
  M('tvs', 'Sport', MC),
  M('tvs', 'Star City Plus', MC),
  M('tvs', 'Ronin', MC),
  M('tvs', 'XL100', MO),

  /* ── Bajaj ─────────────────────────────────────────────────────────── */
  M('bajaj', 'Pulsar 125', MC),
  M('bajaj', 'Pulsar 150', MC),
  M('bajaj', 'Pulsar N160', MC),
  M('bajaj', 'Pulsar NS200', MC),
  M('bajaj', 'Pulsar RS200', MC),
  M('bajaj', 'Platina 100', MC),
  M('bajaj', 'CT 110X', MC),
  M('bajaj', 'Avenger Cruise 220', MC),
  M('bajaj', 'Dominar 400', MC),
  M('bajaj', 'Freedom 125', MC),

  /* ── Royal Enfield ─────────────────────────────────────────────────── */
  M('royal-enfield', 'Classic 350', MC),
  M('royal-enfield', 'Bullet 350', MC),
  M('royal-enfield', 'Hunter 350', MC),
  M('royal-enfield', 'Meteor 350', MC),
  M('royal-enfield', 'Himalayan 450', MC),
  M('royal-enfield', 'Interceptor 650', MC),
  M('royal-enfield', 'Continental GT 650', MC),

  /* ── Yamaha ────────────────────────────────────────────────────────── */
  M('yamaha', 'FZ-S FI', MC),
  M('yamaha', 'FZ-X', MC),
  M('yamaha', 'MT-15 V2', MC),
  M('yamaha', 'R15 V4', MC),
  M('yamaha', 'Fascino 125', SC),
  M('yamaha', 'RayZR 125', SC),

  /* ── Suzuki ────────────────────────────────────────────────────────── */
  M('suzuki', 'Access 125', SC),
  M('suzuki', 'Burgman Street 125', SC),
  M('suzuki', 'Avenis 125', SC),
  M('suzuki', 'Gixxer 150', MC),
  M('suzuki', 'Gixxer SF 250', MC),

  /* ── KTM / Jawa / Yezdi ────────────────────────────────────────────── */
  M('ktm', 'Duke 200', MC),
  M('ktm', 'Duke 250', MC),
  M('ktm', 'Duke 390', MC),
  M('ktm', 'RC 200', MC),
  M('jawa', 'Jawa 42', MC),
  M('jawa', 'Jawa 350', MC),
  M('yezdi', 'Roadster', MC),
  M('yezdi', 'Adventure', MC),

  /* ── Vespa / Aprilia ───────────────────────────────────────────────── */
  M('piaggio', 'Vespa SXL 125', SC),
  M('piaggio', 'Vespa VXL 150', SC),
  M('aprilia', 'SR 160', SC),

  /* ── Electric scooters ─────────────────────────────────────────────── */
  M('ola-electric', 'S1 Pro', ES),
  M('ola-electric', 'S1 Air', ES),
  M('ola-electric', 'S1 X', ES),
  M('ather', '450X', ES),
  M('ather', '450S', ES),
  M('ather', 'Rizta', ES),
  M('tvs-iqube', 'iQube S', ES),
  M('tvs-iqube', 'iQube ST', ES),
  M('bajaj-chetak', 'Chetak 3501', ES),
  M('bajaj-chetak', 'Chetak 2903', ES),
  M('hero-vida', 'V1 Pro', ES),
  M('hero-vida', 'VX2', ES),
  M('ampere', 'Magnus EX', ES),
  M('ampere', 'Nexus', ES),
  M('okinawa', 'Praise Pro', ES),
  M('okinawa', 'Ridge Plus', ES),
  M('hero-electric', 'Optima CX', ES),
  M('hero-electric', 'Photon', ES),
  M('bgauss', 'RUV350', ES),
  M('kinetic-green', 'Zing', ES),
  M('pure-ev', 'EPluto 7G', ES),
  M('river', 'Indie', ES),

  /* ── Electric motorcycles ──────────────────────────────────────────── */
  M('revolt', 'RV400', EM),
  M('revolt', 'RV1', EM),
  M('ultraviolette', 'F77', EM),
  M('simple-energy', 'Simple One', ES),
];

/** `hero` + `Splendor Plus` → `hero-splendor-plus`. Stable and readable. */
function toCode(brandCode, name) {
  return `${brandCode}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { VERTICAL, MODELS, toCode };
