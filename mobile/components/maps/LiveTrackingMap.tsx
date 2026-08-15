import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSocket } from '../../hooks/useSocket';
import type { WorkerLocationEvent } from '../../services/socket/events';

interface LiveTrackingMapProps {
  orderId: string;
  pickupLat: number;
  pickupLng: number;
  /** Seeds the marker before the first socket tick — see Order.workerCurrentLocation. */
  initialWorkerLocation?: { lat: number; lng: number } | null;
}

export const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  orderId,
  pickupLat,
  pickupLng,
  initialWorkerLocation = null,
}) => {
  const [workerLocation, setWorkerLocation] = useState<{ lat: number; lng: number } | null>(initialWorkerLocation);
  const socketClient = useSocket(orderId);

  useEffect(() => {
    const handler = (data: WorkerLocationEvent) => setWorkerLocation({ lat: data.lat, lng: data.lng });
    socketClient.on('worker.location', handler);
    return () => socketClient.off('worker.location', handler);
  }, [socketClient]);

  const initialRegion = {
    latitude: workerLocation?.lat || pickupLat,
    longitude: workerLocation?.lng || pickupLng,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={initialRegion}>
        <Marker 
          coordinate={{ latitude: pickupLat, longitude: pickupLng }} 
          title="Pickup Location" 
          pinColor="green" 
        />
        
        {workerLocation && (
          <Marker 
            coordinate={{ latitude: workerLocation.lat, longitude: workerLocation.lng }} 
            title="Worker" 
            pinColor="blue"
          />
        )}

        {workerLocation && (
          <Polyline 
            coordinates={[
              { latitude: pickupLat, longitude: pickupLng },
              { latitude: workerLocation.lat, longitude: workerLocation.lng },
            ]}
            strokeColor="#2563EB" // Zappy primary blue
            strokeWidth={3}
          />
        )}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: Dimensions.get('window').height * 0.4,
    width: '100%',
    overflow: 'hidden',
    borderRadius: 16,
  },
  map: {
    width: '100%',
    height: '100%',
  },
});
