// On while a pro is online, or while a shop owner is signed in: the shop takes jobs all day. New offers are also read out while the app is open.
import { AppState } from 'react-native';
import * as Speech from 'expo-speech';
import { useGetWorkerMeQuery } from '@zappy/core/api';
import { useSocketEvent } from '@zappy/core/hooks/useSocketEvent';
import { useAppSelector } from '@zappy/core/store/hooks';
import { useCaptainMode } from './useCaptainMode';

const rupees = (p?: number) => (p && p > 0 ? `${Math.round(p / 100)} rupees` : '');
const words = (s?: string | null) => String(s || '').replace(/[-_]+/g, ' ').trim();

// One sentence, never two at once: a new offer replaces one still being read.
function say(parts: (string | false | undefined)[]) {
  if (AppState.currentState !== 'active') return;
  const text = parts.filter(Boolean).join('. ');
  try { Speech.stop(); Speech.speak(text, { language: 'en-IN', rate: 1.0 }); } catch { /* no voice on this phone */ }
}

export function CaptainMode() {
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated);
  const role = useAppSelector((s) => s.auth.role);
  const isWorker = signedIn && role === 'worker';
  const { data } = useGetWorkerMeQuery(undefined, { skip: !isWorker });
  const online = isWorker ? !!(data as { worker?: { isOnline?: boolean } } | undefined)?.worker?.isOnline : signedIn && role === 'shop';
  useCaptainMode({ on: online, role });

  useSocketEvent('repair.offer', (p) => say(['New job on ZappyOne', words(p?.repairCode) || words(p?.device), rupees((p?.totalPaise || 0) + (p?.boostPaise || 0) + (p?.surgePaise || 0))]), online);
  useSocketEvent('job.offer', (p) => say(['New job on ZappyOne', p?.area && `in ${p.area}`]), online);
  useSocketEvent('job.available', (p) => say(['New job near you', p?.area && `in ${p.area}`]), online);
  return null;
}
