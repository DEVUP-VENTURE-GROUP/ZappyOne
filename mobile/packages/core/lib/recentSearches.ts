/** Recent searches, on the phone only (the websites' recentSearches): small and deduped. */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'zappy:recentSearches';
const MAX = 8;

export async function getRecent(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { return []; }
}

export async function addRecent(term: string): Promise<string[]> {
  const t = String(term || '').trim();
  const list = await getRecent();
  if (!t) return list;
  const next = [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX);
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export async function clearRecent(): Promise<string[]> {
  AsyncStorage.removeItem(KEY).catch(() => {});
  return [];
}
