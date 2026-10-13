/**
 * The other vehicles or devices waiting to be booked with this one (the
 * website's useRepairBasket), kept on the phone while the customer moves
 * between flows (bike, then car). One basket for the app; every screen using
 * it sees the same one.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sameItem } from '@zappy/core/shared/repairBasket';

const KEY = 'repair:basket';
const DAY = 24 * 60 * 60 * 1000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = any;

let items: Item[] = [];
let loaded = false;
const listeners = new Set<(v: Item[]) => void>();

function set(next: Item[]) {
  items = next;
  AsyncStorage.setItem(KEY, JSON.stringify({ at: Date.now(), items })).catch(() => {});
  listeners.forEach((l) => l(items));
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const d = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    if (d && Date.now() - d.at < DAY) { items = d.items || []; listeners.forEach((l) => l(items)); }
  } catch { /* nothing saved */ }
}

export function useRepairBasket() {
  const [list, setList] = useState<Item[]>(items);
  useEffect(() => {
    listeners.add(setList);
    load();
    return () => { listeners.delete(setList); };
  }, []);
  const add = useCallback((item: Item) => { if (item && !items.some((b) => sameItem(b, item))) set([...items, item]); }, []);
  const remove = useCallback((i: number) => set(items.filter((_, j) => j !== i)), []);
  const clear = useCallback(() => set([]), []);
  return { items: list, add, remove, clear };
}
