/**
 * How a job offer is shaped and chosen — platform-free, used by the websites
 * (JobOfferHost / JobOfferAlert / PassReasonPicker) and the apps alike.
 *
 * Three ways work arrives, one shape for all of them:
 *   - offered to you   a repair the engine matched to you, or a pet booking a
 *                      customer chose you for: minutes to answer, Pass asks why
 *   - open near you    a pet or helping job any verified provider nearby can
 *                      take: first to accept gets it
 *
 * Keep this file free of browser APIs: the apps load it too.
 */

export const MODE_LABEL = {
  doorstep: 'At the customer', workshop: 'Bring to workshop', pickup_repair: 'Pickup & return', diagnosis_only: 'Inspection only',
  home_visit: 'Home visit', provider_location: 'At your place', pickup_and_return: 'Pickup & return',
  transport: 'Transport', boarding: 'Boarding', daycare: 'Daycare',
};

export const OPEN_WINDOW_SEC = 90;
export const DEFAULT_WINDOW_SEC = 10 * 60;

/** Why a job is being passed — kept so owners and ops see real reasons, not "declined". */
export const PASS_REASONS = [
  'Busy on another job',
  'Too far away',
  "Don't have the part or tool",
  'Not well / going off duty',
  'Vehicle problem',
];

const when = (at) => (at ? new Date(at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

// The boost is part of the key: passing at ₹400 is not passing at ₹450, so a
// boosted job rings again for everyone, including whoever passed or hid it.
export const keyOf = (o) => `${o.kind}:${o.id}:${o.boostPaise || 0}`;

/** A window this long is read as minutes, never as a count of seconds. */
export function offerClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* Each source shaped into what the alert shows. */
export const fromRepair = (b) => ({
  kind: 'repair', id: String(b.bookingId || b._id), mode: 'offered', askReason: true,
  heading: 'New repair job',
  title: b.device || [b.brandCode, b.modelCode].filter(Boolean).join(' ').replace(/-/g, ' ') || 'Device repair',
  valueLabel: (b.isEstimate ?? b.priceSnapshot?.isEstimate) ? 'Estimate' : 'Job value',
  valuePaise: (b.totalPaise ?? b.priceSnapshot?.totalPaise ?? 0) + (b.boostPaise ?? b.boost?.paise ?? 0) + (b.surgePaise ?? b.surge?.providerPaise ?? 0),
  boostPaise: b.boostPaise ?? b.boost?.paise ?? 0,
  surgePaise: b.surgePaise ?? b.surge?.providerPaise ?? 0,
  // The journey fee (visit, or pickup and return) and how far: the provider's to know.
  travelPaise: b.travelPaise ?? ((b.priceSnapshot?.travelPaise || 0) + (b.priceSnapshot?.pickupPaise || 0) + (b.priceSnapshot?.returnPaise || 0)),
  distanceKm: b.distanceKm ?? b.priceSnapshot?.distanceKm ?? null,
  // Several items at one visit: one answer covers them all (repair/services/group).
  groupSize: b.groupSize || 1,
  customer: b.customer || null,
  cash: b.paymentMethod === 'cash',
  howLabel: MODE_LABEL[b.serviceMode] || b.serviceMode,
  address: b.address ?? b.location?.address ?? '',
  landmark: b.landmark ?? b.location?.landmark ?? '',
  coordinates: b.coordinates ?? b.location?.coordinates ?? null,
  whenLabel: b.slotLabel || '',
  expiresAt: b.expiresAt || b.stageDeadlineAt,
  windowSec: b.windowSec,
});

export const fromPetOffer = (b) => ({
  kind: 'pet', id: String(b.id || b._id), mode: 'offered', askReason: false,
  customer: b.customer || null,
  heading: 'A customer chose you',
  title: b.title || (b.pets || []).map((p) => p.snapshot?.name).filter(Boolean).join(', ') || 'Pet care',
  valueLabel: 'You earn',
  valuePaise: b.earningPaise ?? ((b.pricing?.providerAmountPaise ?? 0) + (b.boost?.paise ?? 0)),
  boostPaise: b.boostPaise ?? b.boost?.paise ?? 0,
  howLabel: b.service || (b.categoryCode || '').replace(/_/g, ' '),
  address: b.area ?? b.serviceLocation?.address ?? '',
  coordinates: b.coordinates ?? b.serviceLocation?.coordinates ?? null,
  whenLabel: when(b.at || b.scheduledAt || b.checkInAt),
  expiresAt: b.expiresAt || b.offerExpiresAt,
  windowSec: b.windowSec,
});

export const fromOpen = (p) => ({
  kind: p.kind, id: String(p.id), mode: 'open', askReason: false,
  heading: 'New job near you · first to accept',
  title: p.title || 'New job',
  valueLabel: 'You earn',
  valuePaise: p.earningPaise || 0,
  boostPaise: p.boostPaise || 0,
  surgePaise: p.surgePaise || 0,
  customer: p.customer || null,
  howLabel: p.service || p.kind,
  address: p.area || '',
  coordinates: p.coordinates || null,
  km: p.km ?? null,
  whenLabel: when(p.at),
  frontPaise: p.frontPaise || 0,
  expiresAt: new Date(Date.now() + OPEN_WINDOW_SEC * 1000).toISOString(),
  windowSec: OPEN_WINDOW_SEC,
  acceptLabel: 'Take this job',
});

/** Offers still inside their window, from the job lists (before this screen opened). */
export function recoveredOffers(repairData, petData, now = Date.now()) {
  const alive = (at) => at && new Date(at).getTime() > now;
  return [
    ...(repairData?.bookings || []).filter((b) => b.status === 'PROVIDER_ASSIGNED' && alive(b.stageDeadlineAt)).map(fromRepair),
    ...(petData?.bookings || []).filter((b) => b.status === 'PROVIDER_ASSIGNED' && alive(b.offerExpiresAt)).map(fromPetOffer),
  ];
}

/**
 * The one offer to show now. Offered-to-you first (they're yours to lose),
 * then open jobs, oldest first. A job hidden at an amount stays hidden at that
 * amount or less: a list fetched before a boost cannot bring back the lower one.
 */
export function pickOffer(live, recovered, handled) {
  const seen = new Set();
  return [...live, ...recovered]
    .filter((o) => {
      const job = `${o.kind}:${o.id}`;
      const hiddenAt = Math.max(-1, ...[...handled].filter((h) => h.startsWith(`${job}:`)).map((h) => Number(h.split(':')[2])));
      if (seen.has(job) || (o.boostPaise || 0) <= hiddenAt) return false;
      seen.add(job);
      return true;
    })
    .sort((a, b) => Number(b.mode === 'offered') - Number(a.mode === 'offered'))[0] || null;
}

/** Add a live offer; the same job at a higher amount replaces the older alert. */
export function withOffer(queue, offer) {
  return queue.some((o) => keyOf(o) === keyOf(offer))
    ? queue
    : [...queue.filter((o) => !(o.kind === offer.kind && o.id === offer.id)), offer];
}
