// Same as the app's upload: a fresh link each try, 3 tries, and a slow line is given up on after 60 s instead of hanging.
const TRIES = 3;
const WAIT_MS = 60 * 1000;

export async function sendSigned(getSigned, body, contentType, { tries = TRIES, timeoutMs = WAIT_MS } = {}) {
  let last = new Error('upload failed');
  for (let i = 0; i < tries; i += 1) {
    if (i) await new Promise((r) => setTimeout(r, 1500 * i));
    let timer;
    try {
      const signed = await getSigned();
      const stop = new AbortController();
      timer = setTimeout(() => stop.abort(), timeoutMs);
      const res = await fetch(signed.uploadUrl, { method: 'PUT', body, headers: { 'Content-Type': contentType }, signal: stop.signal });
      if (res.ok) return signed;
      last = new Error(`upload failed (${res.status})`);
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

export default sendSigned;
