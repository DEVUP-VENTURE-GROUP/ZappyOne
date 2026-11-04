// Keeps a pro's position live with the screen off (an Android foreground service with the ZappyOne notification); defined at load, as background tasks must be.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
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

/** Starts the service when it may run: location allowed all the time. Returns whether it is running. */
export async function startBackgroundLocation(title: string, body: string): Promise<boolean> {
  try {
    if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return false;
    if ((await Location.getBackgroundPermissionsAsync()).status !== 'granted') {
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
