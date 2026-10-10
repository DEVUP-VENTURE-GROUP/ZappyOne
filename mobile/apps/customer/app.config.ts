import type { ExpoConfig } from 'expo/config';

/**
 * ZappyOne. Store identity, permissions and native plugins.
 * Secrets never live here: keys come from EAS environment variables.
 */
const config: ExpoConfig = {
  name: 'ZappyOne',
  slug: 'zappy',
  scheme: 'zappyone',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.zappyone.app',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'ZappyOne uses your location to find professionals near you and to track your booking.',
      NSCameraUsageDescription: 'ZappyOne uses the camera for photos of what needs fixing.',
      NSPhotoLibraryUsageDescription: 'ZappyOne uses your photos to show what needs fixing.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.zappyone.app',
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'POST_NOTIFICATIONS'],
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' } },
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    'expo-font',
    ['expo-splash-screen', { image: './assets/images/splash-icon.png', resizeMode: 'contain', backgroundColor: '#FFFFFF' }],
    ['expo-location', { locationWhenInUsePermission: 'ZappyOne uses your location to find professionals near you and to track your booking.' }],
    ['expo-camera', { cameraPermission: 'ZappyOne uses the camera for photos of what needs fixing.', recordAudioAndroid: false }],
    'expo-notifications',
    ['expo-image-picker', { photosPermission: 'ZappyOne uses your photos to show what needs fixing.', microphonePermission: false }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    // Which ZappyOne app this is; sent to the server as X-App (core/config/env).
    app: 'customer',
      eas: { projectId: '76a99e9d-8a13-418c-aa22-ca591fd5e3cf' },
  },
  owner: 'devup-ventures-01',
};

export default config;
