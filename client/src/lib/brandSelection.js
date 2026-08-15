/**
 * The customer's brand/model choice for a vertical, remembered on the device.
 *
 * Shared by the dedicated brand step (`/service/:code/brand`) and the summary
 * row on the service detail page, so both read and write one place. Keyed by
 * brand-category rather than by service: your car is the same car whether
 * you're booking an AC refill or a wheel alignment.
 *
 * Only codes are stored for lookups (`brand`, `model`) plus display names for
 * the UI — the codes are what the pricing service and the order document use.
 */

const key = (brandCategory) => `zappy.catalog.brand.${brandCategory}`;

export function readSelection(brandCategory) {
  if (!brandCategory) return null;
  try {
    const raw = localStorage.getItem(key(brandCategory));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && parsed.brand ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSelection(brandCategory, selection) {
  if (!brandCategory) return;
  try {
    if (selection?.brand) {
      localStorage.setItem(key(brandCategory), JSON.stringify(selection));
    } else {
      localStorage.removeItem(key(brandCategory));
    }
  } catch { /* private mode / quota — the choice just isn't remembered */ }
}

/** Query string handed to the booking flow: `?brand=…&model=…`. */
export function selectionToQuery(selection) {
  const params = new URLSearchParams();
  if (selection?.brand) params.set('brand', selection.brand);
  if (selection?.model) params.set('model', selection.model);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
