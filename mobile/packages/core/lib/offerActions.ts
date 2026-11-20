// An Accept tapped on a job offer notification, waiting for the offer screen (JobOfferHost) to run its own accept for that job.
type Pending = { id: string; at: number };
let pending: Pending | null = null;
const listeners = new Set<() => void>();

export function requestOfferAccept(id: string) {
  pending = { id: String(id), at: Date.now() };
  listeners.forEach((l) => l());
}

// The offer screen takes it once; an old one (over two minutes, the offer is gone) is dropped.
export function takeOfferAccept(id: string): boolean {
  if (!pending || pending.id !== String(id)) return false;
  const fresh = Date.now() - pending.at < 120000;
  pending = null;
  return fresh;
}

export function onOfferAccept(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
