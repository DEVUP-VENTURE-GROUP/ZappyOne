// Keeps a pro's position live with the screen off (an Android foreground service with the ZappyOne notification); defined at load, as background tasks must be.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, AppState } from 'react-native';
import { axiosClient } from '@zappy/core/api/axiosClient';
import { store } from '@zappy/core/store';

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

/** Starts the service when it may run: location allowed all the time. Returns whether it is running. */
export async function startBackgroundLocation(title: string, body: string): Promise<boolean> {
  try {
    if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return false;
    if ((await Location.getBackgroundPermissionsAsync()).status !== 'granted') {
      if (!(await explainBackgroundLocation())) return false;
      if ((await Location.requestBackgroundPermissionsAsync()).status !== 'granted') return false;
    }
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,
      distanceInterval: 50,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: { notificationTitle: title, notificationBody: body, notificationColor: '#1F4FD8', killServiceOnDestroy: false },
    });
    return true;
  } catch { return false; }
}

export async function stopBackgroundLocation(): Promise<void> {
  try { if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK); } catch { /* already stopped */ }
}
