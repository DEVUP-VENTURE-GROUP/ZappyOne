/**
 * Open turn-by-turn directions to a point in the phone's maps app.
 */
import { Linking } from 'react-native';

export const directions = (lat: number, lng: number) => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);
