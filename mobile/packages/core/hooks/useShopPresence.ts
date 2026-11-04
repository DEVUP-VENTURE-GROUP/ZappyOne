// While a shop owner has ServicePro open, where they are (server shops/me/location): arrival times start from them, not the shop's address, when they are the one nearer the customer.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { axiosClient } from '../api/axiosClient';

const EVERY_MS = 60 * 1000;

export function useShopPresence({ active }: { active: boolean }): void {
  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    const send = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || stopped || AppState.currentState !== 'active') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (stopped || (loc.coords.accuracy ?? 0) > 200) return;
        await axiosClient.post('/shops/me/location', { lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch { /* no fix or no network: the next minute tries again */ }
    };
    void send();
    const t = setInterval(send, EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void send(); });
    return () => { stopped = true; clearInterval(t); sub.remove(); };
  }, [active]);
}
