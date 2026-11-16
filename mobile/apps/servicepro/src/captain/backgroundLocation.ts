// Keeps a pro's position live with the screen off (an Android foreground service with the ZappyOne notification; iOS background location while online); defined at load, as background tasks must be.
// When it may run is decided by one race-safe controller (locationController); this file wires it to expo-location, the prompts and the server.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { axiosClient } from '@zappy/core/api/axiosClient';
import { api } from '@zappy/core/api/sharedApi';
import { store } from '@zappy/core/store';
import { onTripChange } from '@zappy/core/hooks/useJobTrip';
import { createLocationController, type DenialReason } from './locationController';

export const LOCATION_TASK = 'zappy-background-location';

const stopNativeTask = async () => {
  try { if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK); } catch { /* already stopped */ }
};

// The server's own view, read from the background at most this often: a worker's heartbeat (POST /workers/heartbeat answers isOnline), a shop's profile (takingOrders).
const WORKER_CHECK_MS = 60_000;
const SHOP_CHECK_MS = 5 * 60_000;
let lastServerCheck = 0;

/** Asks the server whether this account is still online; true only when it answers that it is not. Network failure: unknown, so nothing changes. */
async function serverSaysOffline(role: string): Promise<boolean> {
  const now = Date.now();
  if (now - lastServerCheck < (role === 'shop' ? SHOP_CHECK_MS : WORKER_CHECK_MS)) return false;
  lastServerCheck = now;
  try {
    if (role === 'worker') {
      // No coordinates: only "still here", and the answer says whether the server still has this worker online.
      const { data } = await axiosClient.post('/workers/heartbeat', {});
      return (data as { isOnline?: boolean } | undefined)?.isOnline === false;
    }
    const { data } = await axiosClient.get('/shops/me/profile');
    return (data as { shop?: { takingOrders?: boolean } } | undefined)?.shop?.takingOrders === false;
  } catch {
    return false;
  }
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const { hydrated, role } = store.getState().auth;
  // A fresh JavaScript context (Android can run the task before the app UI) has not read the saved sign-in yet: do nothing on a guess.
  if (!hydrated) return;
  // Signed out (here or by the server): nothing may track.
  if (role !== 'worker' && role !== 'shop') { await stopNativeTask(); return; }
  // In the app, the foreground watchers already send it (useOnlinePresence, useShopPresence) and the profile query keeps the state.
  if (AppState.currentState === 'active') return;

  // Set offline elsewhere (the presence sweep, the website, another phone): stop now, and refresh the cached profile so the app does not start it again.
  if (await serverSaysOffline(role)) {
    await stopNativeTask();
    void locationController.serverOffline();
    store.dispatch(api.util.invalidateTags(role === 'worker' ? ['Me', 'Worker'] : ['Shop']));
    return;
  }

  const loc = (data as { locations?: Location.LocationObject[] } | undefined)?.locations?.slice(-1)[0];
  if (!loc || (loc.coords.accuracy ?? 0) > 200) return;
  const at = { lat: loc.coords.latitude, lng: loc.coords.longitude };
  try {
    if (role === 'worker') await axiosClient.post('/workers/location', { ...at, accuracy: loc.coords.accuracy ?? null });
    else await axiosClient.post('/shops/me/location', at);
  } catch { /* no network: the next reading tries again */ }
});

// The explanation before the system's background question. Google Play requires it before Android's "Allow all the time"; iOS gets its own words and choice.
function explainBackgroundLocation(): Promise<boolean> {
  const ios = Platform.OS === 'ios';
  const title = ios ? 'Allow location in the background?' : 'Use your location while you are online?';
  const body = ios
    ? 'While you are online, ServicePro uses your location in the background and with the screen locked, to send you jobs near you and to show the customer your trip on an active job. It stops when you go offline.\n\nOn the next screen, choose "Change to Always Allow".'
    : 'ZappyOne ServicePro collects location data to send you jobs near you and to show customers that you are on the way, even when the app is closed or not in use. This happens only while you are online, with a "You are online" notification shown. It stops when you go offline.\n\nOn the next screen, choose "Allow all the time".';
  return new Promise((resolve) => {
    let answered = false;
    const answer = (ok: boolean) => { if (!answered) { answered = true; resolve(ok); } };
    Alert.alert(title, body,
      [{ text: 'Not now', style: 'cancel', onPress: () => answer(false) }, { text: 'Continue', onPress: () => answer(true) }],
      { cancelable: true, onDismiss: () => answer(false) });
  });
}

// Online but nothing can run in the background: say so, once per denial, with the way to fix it. Never a silent failure.
function showDenied(reason: DenialReason) {
  const ios = Platform.OS === 'ios';
  const title = reason === 'foreground' ? 'Location is off' : 'Location in the background is off';
  const body = reason === 'foreground'
    ? 'You are online, but ServicePro cannot use your location, so jobs near you cannot reach you. Turn location on for ServicePro in Settings.'
    : ios
      ? 'You are online, but ServicePro can use your location only while the app is open. To get jobs and share your trip with the app in the background or the screen locked, open Settings, then Location, and choose "Always".'
      : 'You are online, but ServicePro can use your location only while the app is open. To get jobs and share your trip with the app closed, open Settings, then Location, and choose "Allow all the time".';
  Alert.alert(title, body, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
  ]);
}

let notice = { title: 'ZappyOne: you are online', body: 'Tap to open ServicePro.' };
/** The words on Android's persistent notification (a worker online, or a shop open for jobs). */
export function setOnlineNotice(title: string, body: string) { notice = { title, body }; }

// On a trip the customer is watching: precise, every 12 s. Otherwise every 2 minutes even when standing still, so the server never prices a job from a stale position (matching LIVE_FRESH_MS is 15 minutes).
const optionsFor = (trip: boolean): Location.LocationTaskOptions => ({
  accuracy: trip ? Location.Accuracy.High : Location.Accuracy.Balanced,
  timeInterval: trip ? 12000 : 120000,
  distanceInterval: trip ? 20 : 0,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: { notificationTitle: notice.title, notificationBody: notice.body, notificationColor: '#1F4FD8', killServiceOnDestroy: false },
});

export const locationController = createLocationController({
  hasStarted: () => Location.hasStartedLocationUpdatesAsync(LOCATION_TASK),
  start: (trip) => Location.startLocationUpdatesAsync(LOCATION_TASK, optionsFor(trip)),
  stop: () => Location.stopLocationUpdatesAsync(LOCATION_TASK),
  permissions: async () => {
    const [fg, bg] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()]);
    return { foreground: fg.status === 'granted', background: bg.status === 'granted', canAskBackground: bg.canAskAgain !== false };
  },
  askBackground: async () => {
    if (await explainBackgroundLocation()) await Location.requestBackgroundPermissionsAsync();
  },
  // Android refuses to start a foreground service from the background, so starts and pace changes wait for the app to be open.
  canStartNow: () => AppState.currentState === 'active',
}, { onDenied: showDenied });

onTripChange((trip) => { void locationController.setTrip(trip); });
// Back in the app: permissions may have changed in Settings, and a start that had to wait can run now.
AppState.addEventListener('change', (s) => { if (s === 'active') void locationController.revalidate(); });
