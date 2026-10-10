/** Whether this build can draw a map. */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { PROVIDER_GOOGLE } from 'react-native-maps';

/**
 * iOS draws Apple Maps with no key. Android's Google provider needs the key in
 * the build (GOOGLE_MAPS_ANDROID_KEY) and crashes without one, so screens show
 * a plain card or a list instead.
 */
export const mapsAvailable = Platform.OS === 'ios' || !!Constants.expoConfig?.android?.config?.googleMaps?.apiKey;

/** Google on Android; Apple's own maps on iOS. */
export const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
