// The errand booking screen's modes. Shop and pick up are built in; every other service brings its own form from the catalog (ServiceLine.form), so a new one needs no app update.
export const HELP_MODES = {
  shop: { type: 'shopping', line: 'shopping_pickup', title: 'Shopping for Me', items: true, start: 'Shop / market', end: 'Bring it to', task: 'Shopping task', draft: 'Shopping errand' },
  pickup: { type: 'pickup', line: 'shopping_pickup', title: 'Pick Up for Me', start: 'Pickup location', end: 'Bring it to', ask: "What's being picked up?", hint: 'e.g. Repaired laptop from City Electronics, reference #4521', task: 'Pickup task', draft: 'Pickup and drop' },
};

// What this app can render from a catalog form; the server hides services that need more (X-UI-Level).
export const UI_LEVEL = 2;

/** The form for ?mode=key: a built-in one, else the catalog service whose form has that type, else null while the catalog loads. */
export function helpModeFrom(catalog, key) {
  if (HELP_MODES[key]) return HELP_MODES[key];
  for (const d of catalog?.domains || []) {
    for (const s of d.services || []) {
      if (s.form?.type === key) return { ...s.form, line: s.form.line || s.code, title: s.form.title || s.name };
    }
  }
  return null;
}

// Grocery and medicine start at the shop when one is given, otherwise near home; everything else starts at the customer.
export function helpPlaces(mode, start, end) {
  if (!mode.home) return { pickup: start, destination: end };
  return { pickup: end || start, destination: start };
}

// Where "book again" goes for a finished task of this type.
export function rebookPath(type) {
  if (['return', 'exchange'].includes(type)) return '/helping/returns';
  if (type === 'pickup') return '/helping/shopping?mode=pickup';
  return type && type !== 'shopping' ? `/helping/shopping?mode=${type}` : '/helping/shopping';
}

// A Family Assist card's live fee (admin HelpingConfig), so cards never show a stale figure; the catalog tagline's own ₹ prefix gives way to it.
export function helpCardPrice(service, helping) {
  const fees = new Map((helping?.services || []).map((s) => [s.serviceType, s.baseFeePaise]));
  const types = service.form?.type ? [[service.form.type, '']] : service.code === 'shopping_pickup' ? [['pickup', 'Pickup'], ['shopping', 'Shopping']] : [];
  const prices = types.map(([t, label]) => ({ label, paise: fees.get(t) })).filter((p) => p.paise > 0);
  const tagline = service.tagline || service.description || '';
  const shops = prices.some((p) => p.label === 'Shopping');
  if (!prices.length) return { prices, plusBill: false, note: tagline };
  const m = tagline.match(/^₹[\d,]+\s*(\+\s*bill)?\s*·?\s*(.*)$/);
  return { prices, plusBill: shops || !!m?.[1], note: m ? m[2] : tagline };
}
