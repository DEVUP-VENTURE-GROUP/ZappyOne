/**
 * Auto-accept, in words (server jobs/fast-assign): what the provider's card
 * says about their setting. Platform-free; the websites and the apps both use it.
 */

const day = (at) => new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** The line under the switch: on, off, or paused and until when. */
export function autoAcceptStatus(view) {
  const a = view?.autoAccept || {};
  const km = a.maxKm ? Math.min(a.maxKm, view.radiusKm) : view?.radiusKm;
  if (a.pausedUntil) return `Paused until ${day(a.pausedUntil)}: a job it took for you was handed back.`;
  if (!a.enabled) return `Off. Turn it on and jobs within ${km} km come to you with no tap while you are online and free.`;
  return `On. Jobs within ${km} km are yours the moment they come in, while you are online and free.`;
}

/** The fine print: what handing one back costs. */
export const autoAcceptRule = (view) => `Hand back a job it took and auto-accept pauses for ${view?.pauseDays ?? 7} days.`;

/** The distance limits a provider may pick (null = the platform's radius). */
export const AUTO_ACCEPT_KM = [null, 2, 3, 5];
