/**
 * A booking in progress, saved on the phone as the customer goes (the
 * websites' useBookingFlow drafts): leaving for a call or another app and
 * coming back resumes it. Kept a day; cleared when the booking is made or they
 * start over.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const TTL_MS = 24 * 60 * 60 * 1000;
const keyOf = (key: string) => `draft:${key}`;

export async function readDraft<T>(key: string): Promise<T | null> {
  try {
    const d = JSON.parse((await AsyncStorage.getItem(keyOf(key))) || 'null');
    if (!d || Date.now() - d.at > TTL_MS) return null;
    return d.v as T;
  } catch { return null; }
}

export function saveDraft(key: string, value: unknown): void {
  AsyncStorage.setItem(keyOf(key), JSON.stringify({ at: Date.now(), v: value })).catch(() => {});
}

export function clearDraft(key: string): void {
  AsyncStorage.removeItem(keyOf(key)).catch(() => {});
}

// Sign-out on a shared phone leaves no one's half-typed forms behind (bookings in progress are the customer's own and kept).
export async function clearFormDrafts(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('draft:form:'));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch { /* storage unavailable */ }
}
