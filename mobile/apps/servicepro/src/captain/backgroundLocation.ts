// Keeps a pro's position live with the screen off (an Android foreground service with the ZappyOne notification); defined at load, as background tasks must be.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, AppState } from 'react-native';
import { axiosClient } from '@zappy/core/api/axiosClient';
import { store } from '@zappy/core/store';
import { onTripChange } from '@zappy/core/hooks/useJobTrip';

export const LOCATION_TASK = 'zappy-background-location';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  // In the app, the foreground watchers already send it (useOnlinePresence, useShopPresence).
  if (error || AppState.currentState === 'active') return;
  const loc = (data as { locations?: Location.LocationObject[] } | undefined)?.locations?.slice(-1)[0];
  if (!loc || (loc.coords.accuracy ?? 0) > 200) return;
  const role = store.getState().auth.role;
  const at = { lat: loc.coords.latitude, lng: loc.coords.longitude };
  try {
    if (role === 'worker') await axiosClient.post('/workers/location', { ...at, accuracy: loc.coords.accuracy ?? null });
    else if (role === 'shop') await axiosClient.post('/shops/me/location', at);
  } catch { /* no network: the next reading tries again */ }
});

// Google Play requires this in-app explanation before Android's "Allow all the time" question; shown once per app run, and the question is asked only after Continue.
let explainedThisRun: boolean | null = null;
function explainBackgroundLocation(): Promise<boolean> {
  if (explainedThisRun !== null) return Promise.resolve(explainedThisRun);
  return new Promise((resolve) => {
    const answer = (ok: boolean) => { explainedThisRun = ok; resolve(ok); };
    Alert.alert(
      'Use your location while you are online?',
      'ZappyOne ServicePro collects location data to send you jobs near you and to show customers that you are on the way, even when the app is closed or not in use. This happens only while you are online, with a "You are online" notification shown. It stops when you go offline.\n\nOn the next screen, choose "Allow all the time".',
      [{ text: 'Not now', style: 'cancel', onPress: () => answer(false) }, { text: 'Continue', onPress: () => answer(true) }],
      { cancelable: true, onDismiss: () => answer(false) },
    );
  });
}

let notice = { title: 'ZappyOne: you are online', body: 'Tap to open ServicePro.' };
let onTrip = false;
let refreshedThisRun = false;

// On a trip the customer is watching: precise, every 12 s. Otherwise every 2 minutes even when standing still, so the server never prices a job from a stale position (matching LIVE_FRESH_MS is 15 minutes).
const optionsFor = (trip: boolean): Location.LocationTaskOptions => ({
  accuracy: trip ? Location.Accuracy.High : Location.Accuracy.Balanced,
  timeInterval: trip ? 12000 : 120000,
  distanceInterval: trip ? 20 : 0,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: { notificationTitle: notice.title, notificationBody: notice.body, notificationColor: '#1F4FD8', killServiceOnDestroy: false },
});

let pace = false;
// Android refuses to start a foreground service from the background, so the pace only changes while the app is open.
async function applyPace() {
  if (pace === onTrip || AppState.currentState !== 'active') return;
  try {
    if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) { pace = onTrip; return; }
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    await Location.startLocationUpdatesAsync(LOCATION_TASK, optionsFor(onTrip));
    pace = onTrip;
  } catch { /* tried again when the app is next opened */ }
}
onTripChange((trip) => { onTrip = trip; void applyPace(); });
AppState.addEventListener('change', (s) => { if (s === 'active') void applyPace(); });

/** Starts the service when it may run: location allowed all the time. Returns whether it is running. */
export async function startBackgroundLocation(title: string, body: string): Promise<boolean> {
  try {
    if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return false;
    if ((await Location.getBackgroundPermissionsAsync()).status !== 'granted') {
      if (!(await explainBackgroundLocation())) return false;
      if ((await Location.requestBackgroundPermissionsAsync()).status !== 'granted') return false;
    }
    notice = { title, body };
    // Already running from an earlier launch: restarted once per launch so it picks up the current pace (an update may have changed it).
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      if (refreshedThisRun) return true;
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    refreshedThisRun = true;
    await Location.startLocationUpdatesAsync(LOCATION_TASK, optionsFor(onTrip));
    pace = onTrip;
    return true;
  } catch { return false; }
}

export async function stopBackgroundLocation(): Promise<void> {
  try { if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK); } catch { /* already stopped */ }
}
