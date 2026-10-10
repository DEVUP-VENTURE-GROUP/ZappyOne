/**
 * The last known service location, kept across launches (the websites'
 * utils/geoCache): thirty minutes, so reopening the app never re-asks, but a
 * customer who has travelled is not offered yesterday's street. A rough fix is
 * never trusted, and an address is kept only while the position stays near it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { metresBetween } from '../shared/distance';

const KEY = 'zappy:loc';
const MAX_AGE_MS = 30 * 60 * 1000;
const ROUGH_M = 150;
const ADDRESS_VALID_WITHIN_M = 150;

export interface CachedLocation { lat: number; lng: number; accuracy?: number | null; address: string; t: number }

/** Worse than this is a guess, not a place to send a pro (the websites' ACCURACY_BAD_M). */
export const ACCURACY_BAD_M = 500;
export const tooRough = (accuracy?: number | null) => typeof accuracy === 'number' && accuracy > ACCURACY_BAD_M;

async function readRaw(): Promise<CachedLocation | null> {
  try { const s = await AsyncStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

export async function saveGeoLocation({ lat, lng, accuracy = null, address }: { lat: number; lng: number; accuracy?: number | null; address?: string }) {
  try {
    const prev = await readRaw();
    const moved = prev ? metresBetween({ lat, lng }, { lat: prev.lat, lng: prev.lng }) : null;
    // A position without a name inherits the old one only while it has not moved away from it.
    const inheritable = prev?.address && (moved == null || moved <= ADDRESS_VALID_WITHIN_M);
    const next: CachedLocation = { lat, lng, accuracy, address: address ?? (inheritable ? prev!.address : ''), t: Date.now() };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* the cache is a convenience */ }
}

export async function loadGeoLocation(): Promise<CachedLocation | null> {
  const d = await readRaw();
  if (!d || typeof d.lat !== 'number' || typeof d.lng !== 'number') return null;
  if (Date.now() - d.t > MAX_AGE_MS) return null;
  if (typeof d.accuracy === 'number' && d.accuracy > ROUGH_M) return null;
  return d;
}
