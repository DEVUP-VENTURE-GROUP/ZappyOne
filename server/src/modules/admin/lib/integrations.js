// Is each outside service really working: one live call per service (nothing reaches a customer), each with a plain fix when it is not.
const TIMEOUT_MS = 6000;
const HYD = { lat: 17.4483, lng: 78.3915 };
const GACHIBOWLI = { lat: 17.4401, lng: 78.3489 };

const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('No answer in 6 seconds')), TIMEOUT_MS))]);
const row = (key, label, purpose, state, detail, fix = null) => ({ key, label, purpose, state, ok: state === 'ok', detail, fix });

async function getJson(url) {
  const r = await withTimeout(fetch(url));
  return r.json();
}

async function androidPush() {
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: key } = process.env;
  const purpose = 'Job offers, booking updates and reminders on Android phones';
  if (!(projectId && clientEmail && key)) return row('push_android', 'Push to Android (Firebase)', purpose, 'missing', 'Firebase keys are not set on the server.', 'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY from a Firebase service account (Project settings → Service accounts → Generate new private key).');
  try {
    const admin = require('firebase-admin');
    const token = await withTimeout(admin.credential.cert({ projectId, clientEmail, privateKey: key.replace(/\\n/g, '\n') }).getAccessToken());
    return token?.access_token
      ? row('push_android', 'Push to Android (Firebase)', purpose, 'ok', `Signed in to Firebase project ${projectId}.`)
      : row('push_android', 'Push to Android (Firebase)', purpose, 'failing', 'Firebase gave no access token.', 'Generate a new service account key in Firebase and replace FIREBASE_PRIVATE_KEY.');
  } catch (e) {
    return row('push_android', 'Push to Android (Firebase)', purpose, 'failing', `Firebase refused the key: ${e.message.slice(0, 160)}`, 'Generate a new service account key in Firebase (Project settings → Service accounts) and replace FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.');
  }
}

function iosPush() {
  const purpose = 'Job offers, booking updates and Live Activities on iPhones';
  const apns = require('../../notification/apns');
  return apns.isConfigured()
    ? row('push_ios', 'Push to iPhone (APNs)', purpose, 'ok', 'Apple push key is set.')
    : row('push_ios', 'Push to iPhone (APNs)', purpose, 'missing', 'Apple push key is not set, so iPhones get no push.', 'In developer.apple.com → Keys, create an APNs key; set APNS_KEY_ID, APNS_TEAM_ID and APNS_KEY (the .p8 text) on the server.');
}

async function email() {
  const purpose = 'Receipts, invoices, email verification and password reset';
  const mailer = require('../../../core/mail/mailer');
  if (!mailer.isConfigured()) return row('email', 'Email (SMTP)', purpose, 'missing', 'No SMTP server is set, so emails are only logged, never sent.', 'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM (any provider: Zoho, Brevo, Amazon SES, Gmail Workspace).');
  try {
    const nodemailer = require('nodemailer');
    const m = require('../../../config').mail;
    await withTimeout(nodemailer.createTransport({ host: m.host, port: m.port, secure: !!m.secure, auth: m.user ? { user: m.user, pass: m.pass } : undefined }).verify());
    return row('email', 'Email (SMTP)', purpose, 'ok', `Signed in to ${m.host}.`);
  } catch (e) {
    return row('email', 'Email (SMTP)', purpose, 'failing', `The mail server refused: ${e.message.slice(0, 160)}`, 'Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS with your email provider.');
  }
}

const GOOGLE_FIX = {
  REQUEST_DENIED: 'In console.cloud.google.com: link a billing account to the key\'s project, enable Geocoding, Distance Matrix and Directions APIs, and restrict GOOGLE_MAPS_KEY by the server\'s IP address (not by website).',
  OVER_QUERY_LIMIT: 'The Google project is over its quota: raise it in console.cloud.google.com → Quotas.',
};

async function googleMaps() {
  const key = process.env.GOOGLE_MAPS_KEY;
  const purpose = 'Arrival time in traffic, route distance for travel fees, surge, live ETA and address search';
  if (!key) return row('maps_google', 'Google Maps (traffic ETA)', purpose, 'missing', 'No Google key on the server; arrival times use Mapbox or straight-line distance.', 'Set GOOGLE_MAPS_KEY (a key from a billed Google Cloud project, restricted by the server\'s IP address).');
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${HYD.lat},${HYD.lng}&destinations=${GACHIBOWLI.lat},${GACHIBOWLI.lng}&mode=driving&departure_time=now&key=${key}`;
    const d = await getJson(url);
    const el = d.rows?.[0]?.elements?.[0];
    if (d.status === 'OK' && el?.status === 'OK') {
      const traffic = el.duration_in_traffic ? `${Math.round(el.duration_in_traffic.value / 60)} min in traffic` : 'no traffic data';
      return row('maps_google', 'Google Maps (traffic ETA)', purpose, 'ok', `Madhapur to Gachibowli: ${(el.distance.value / 1000).toFixed(1)} km, ${traffic}.`);
    }
    return row('maps_google', 'Google Maps (traffic ETA)', purpose, 'failing', `Google said ${d.status}: ${(d.error_message || '').slice(0, 160)}`, GOOGLE_FIX[d.status] || GOOGLE_FIX.REQUEST_DENIED);
  } catch (e) {
    return row('maps_google', 'Google Maps (traffic ETA)', purpose, 'failing', `Google did not answer: ${e.message}`, 'Check the server can reach maps.googleapis.com.');
  }
}

async function mapbox() {
  const token = process.env.MAPBOX_TOKEN;
  const purpose = 'Fallback for arrival times, nearest-pro ranking and address search when Google is unavailable';
  if (!token) return row('maps_mapbox', 'Mapbox (fallback)', purpose, 'missing', 'No Mapbox token on the server.', 'Set MAPBOX_TOKEN from account.mapbox.com → Tokens.');
  try {
    const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving-traffic/${HYD.lng},${HYD.lat};${GACHIBOWLI.lng},${GACHIBOWLI.lat}?annotations=duration,distance&access_token=${token}`;
    const d = await getJson(url);
    if (d.code === 'Ok') return row('maps_mapbox', 'Mapbox (fallback)', purpose, 'ok', `Madhapur to Gachibowli: about ${Math.round((d.durations?.[0]?.[1] || 0) / 60)} min with traffic.`);
    return row('maps_mapbox', 'Mapbox (fallback)', purpose, 'failing', `Mapbox said ${d.code || d.message}`, 'Check MAPBOX_TOKEN at account.mapbox.com → Tokens.');
  } catch (e) {
    return row('maps_mapbox', 'Mapbox (fallback)', purpose, 'failing', `Mapbox did not answer: ${e.message}`, 'Check the server can reach api.mapbox.com.');
  }
}

/** Every service, checked at once; never throws. */
async function checkAll() {
  const results = await Promise.all([androidPush(), iosPush(), email(), googleMaps(), mapbox()].map((p) => Promise.resolve(p).catch((e) => row('unknown', 'Check', '', 'failing', e.message))));
  const etaSource = results.find((r) => r.key === 'maps_google')?.ok ? 'Google (live traffic)' : results.find((r) => r.key === 'maps_mapbox')?.ok ? 'Mapbox (live traffic)' : 'straight-line distance only';
  return { checkedAt: new Date().toISOString(), allOk: results.every((r) => r.ok), etaSource, services: results };
}

module.exports = { checkAll };
