import type { ExpoConfig } from 'expo/config';

/**
 * ZappyOne ServicePro. Store identity, permissions and native plugins.
 * Secrets never live here: keys come from EAS environment variables.
 */
const config: ExpoConfig = {
  name: 'ZappyOne ServicePro',
  slug: 'zappyone-servicepro',
  scheme: 'zappyone-servicepro',
  // Phone apps only: no web bundle, so a browser hit on the dev server cannot fail a build.
  platforms: ['ios', 'android'],
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.zappyone.servicepro',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'ServicePro uses your location to show nearby jobs and to share your trip with the customer.',
      NSCameraUsageDescription: 'ServicePro uses the camera for KYC documents and job photos.',
      NSPhotoLibraryUsageDescription: 'ServicePro uses your photos for KYC documents and job photos.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.zappyone.servicepro',
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'POST_NOTIFICATIONS'],
    // Merged in by libraries but never used: overlays, and broad storage (photos use the system picker).
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.RECORD_AUDIO'],
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' } },
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    'expo-font',
    ['expo-splash-screen', { image: './assets/images/splash-icon.png', resizeMode: 'contain', backgroundColor: '#FFFFFF' }],
    ['expo-location', { locationWhenInUsePermission: 'ServicePro uses your location to show nearby jobs and to share your trip with the customer.' }],
    ['expo-camera', { cameraPermission: 'ServicePro uses the camera for KYC documents and job photos.', recordAudioAndroid: false }],
    'expo-notifications',
    ['expo-image-picker', { photosPermission: 'ServicePro uses your photos for KYC documents and job photos.', microphonePermission: false }],
  ],
  // Over-the-air JavaScript fixes (eas update); native changes still need a new build.
  updates: { url: 'https://u.expo.dev/a951d06b-96a0-4c63-956d-a47f40350ee3' },
  runtimeVersion: { policy: 'appVersion' },
  experiments: { typedRoutes: true },
  extra: {
    // Which ZappyOne app this is; sent to the server as X-App (core/config/env).
    app: 'servicepro',
      eas: { projectId: 'a951d06b-96a0-4c63-956d-a47f40350ee3' },
  },
  owner: 'devup-ventures-01',
};

export default config;
