import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { socketClient } from '../services/socket/socketClient';
import { createLogger } from '../lib/logger';

const log = createLogger('location-tracker');

export const useLocationTracker = (isActive: boolean, orderId?: string) => {
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        log.warn('location permission denied');
        return;
      }

      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 4000,
          distanceInterval: 15, // Only trigger if moved 15 meters or 4 seconds elapsed
        },
        (location) => {
          // Push location to backend
          socketClient.emit('worker:location', {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            orderId,
            hdg: location.coords.heading ?? undefined,
            spd: location.coords.speed ?? undefined,
            acc: location.coords.accuracy ?? undefined,
          });
        }
      );
    };

    if (isActive) {
      startTracking();
    } else {
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
    }

    return () => {
      if (locationSubRef.current) {
        locationSubRef.current.remove();
      }
    };
  }, [isActive, orderId]);
};
