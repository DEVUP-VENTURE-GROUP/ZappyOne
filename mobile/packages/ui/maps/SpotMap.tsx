import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Bike } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { mapProvider, mapsAvailable } from '../lib/maps';

// One place on a map with a bike on it: where a provider is or works from. A build that cannot draw maps shows nothing.
export function SpotMap({ lat, lng, height = 320 }: { lat: number; lng: number; height?: number }) {
  if (!mapsAvailable) return null;
  return (
    <MapView provider={mapProvider} style={{ height, borderRadius: 16 }} initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }} showsCompass={false} toolbarEnabled={false}>
      <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
        <View style={styles.pin}><Bike size={18} color={colors.textInverse} /></View>
      </Marker>
    </MapView>
  );
}

const styles = StyleSheet.create({
  pin: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.surface },
});
