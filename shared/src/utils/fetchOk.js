/**
 * fetch() for the few files the browser downloads directly (invoices,
 * receipts, reports). A failure throws an Error whose message is shown only
 * when it is the person's to act on (a 4xx with a reason); offline, a server
 * fault or an unreadable reply throw an empty message, so the screen's own
 * calm line shows instead, as with every other call (services/api calm()).
 *
 *   const res = await fetchOk(url, { headers });
 *   …
 *   catch (err) { toast.error(err.message || 'Could not load invoice'); }
 */
export async function fetchOk(url, options) {
  let res;
  try { res = await fetch(url, options); } catch { throw new Error(''); }
  if (res.ok) return res;
  if (res.status >= 500) throw new Error('');
  const body = await res.json().catch(() => ({}));
  throw new Error(typeof body.error === 'string' ? body.error : '');
}
