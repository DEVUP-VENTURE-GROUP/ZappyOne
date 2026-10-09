/**
 * Is it raining at the customer's door? For the rain line on a price (jobs/surge).
 *
 *   where    one reading per ~250 km² area (H3 resolution 5), for the areas
 *            where people are booking right now
 *   sources  Open-Meteo (no key), and OpenWeather when OPENWEATHER_API_KEY is
 *            set. Rain = precipitation ≥ RAIN_MM an hour or a rain/storm code.
 *   doubt    no answer, or the two sources disagree → "not raining". A rain
 *            fee is never charged on a guess.
 *   cost     polled every 10 min (server tick), cached 30 min; a price reads
 *            the cache only, never the network.
 */
const https = require('https');
const h3 = require('h3-js');
const logger = require('../../core/logger');

const RES = 5;
const RAIN_MM = 0.5;
const TTL_SEC = 30 * 60;
// WMO weather codes: drizzle, rain, freezing rain, showers, thunderstorms.
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

const r = () => require('../../config/redis');
const key = (cell) => r().scoped(`weather:${cell}`);
const areaOf = (lat, lng) => h3.latLngToCell(lat, lng, RES);

function getJson(url, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
  });
}

async function openMeteo(lat, lng) {
  const d = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=precipitation,rain,weather_code&timezone=Asia%2FKolkata`);
  const c = d?.current;
  if (!c) throw new Error('no current block');
  return (Number(c.precipitation) || 0) >= RAIN_MM || (Number(c.rain) || 0) >= RAIN_MM || RAIN_CODES.has(Number(c.weather_code));
}

async function openWeather(lat, lng) {
  const k = process.env.OPENWEATHER_API_KEY;
  if (!k) return null;
  const d = await getJson(`https://api.openweathermap.org/data/2.5/weather?lat=${lat.toFixed(3)}&lon=${lng.toFixed(3)}&appid=${k}`);
  const mm = Number(d?.rain?.['1h']) || 0;
  const main = String(d?.weather?.[0]?.main || '').toLowerCase();
  return mm >= RAIN_MM || ['rain', 'drizzle', 'thunderstorm'].includes(main);
}

/** Read one area now; both sources when there are two. */
async function readArea(cell) {
  const [lat, lng] = h3.cellToLatLng(cell);
  const [a, b] = await Promise.all([
    openMeteo(lat, lng).catch((e) => { logger.warn({ err: e.message, cell }, '[weather] open-meteo failed'); return null; }),
    openWeather(lat, lng).catch((e) => { logger.warn({ err: e.message, cell }, '[weather] openweather failed'); return null; }),
  ]);
  const answers = [a, b].filter((x) => x !== null);
  // Nobody answered, or they disagree: not raining, as far as pricing is concerned.
  const rain = answers.length > 0 && answers.every((x) => x === true);
  return { rain, sources: answers.length, disagree: answers.length === 2 && a !== b, at: new Date().toISOString() };
}

/** Poll the areas where people are booking (from the surge engine's active zones). */
async function poll(points = []) {
  const cells = [...new Set(points.map(([lat, lng]) => areaOf(lat, lng)))].slice(0, 40);
  let raining = 0;
  for (const cell of cells) {
    const v = await readArea(cell);
    if (v.rain) raining += 1;
    await r().redis.set(key(cell), JSON.stringify(v), 'EX', TTL_SEC).catch(() => {});
  }
  return { areas: cells.length, raining };
}

/** From the cache only: true when raining, false otherwise (unknown counts as not). */
async function isRaining(lat, lng) {
  try {
    const raw = await r().redis.get(key(areaOf(lat, lng)));
    return raw ? JSON.parse(raw).rain === true : false;
  } catch { return false; }
}

module.exports = { poll, isRaining, readArea, areaOf, RAIN_MM };
