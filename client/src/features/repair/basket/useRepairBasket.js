import { useCallback, useEffect, useState } from 'react';
import { sameItem } from '@shared/customer/repairBasket';

/**
 * The other vehicles or devices waiting to be booked with this one, kept on
 * this device while the customer moves between flows (bike, then car). One
 * basket for the whole site; every open page sees the same one.
 */
const KEY = 'repair:basket';
const DAY = 24 * 60 * 60 * 1000;
const EVENT = 'repair-basket';

function read() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    return d && Date.now() - d.at < DAY ? d.items || [] : [];
  } catch { return []; }
}
function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), items })); } catch { /* storage full or blocked */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useRepairBasket() {
  const [items, setItems] = useState(read);
  useEffect(() => {
    const sync = () => setItems(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const add = useCallback((item) => { if (item) { const now = read(); if (!now.some((b) => sameItem(b, item))) write([...now, item]); } }, []);
  const remove = useCallback((i) => write(read().filter((_, j) => j !== i)), []);
  const clear = useCallback(() => write([]), []);
  return { items, add, remove, clear };
}
