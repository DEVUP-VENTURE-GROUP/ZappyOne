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
  // 1.0.2 adds native parts (background location, bubble, ringtone): its own runtime, so no 1.0.1 phone gets this JS over the air.
  version: '1.0.2',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.zappyone.servicepro',
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'ServicePro uses your location to show nearby jobs and to share your trip with the customer.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'While you are online, ServicePro keeps your location live so nearby jobs reach you and customers see you arrive, even with the screen off.',
      UIBackgroundModes: ['location'],
      NSCameraUsageDescription: 'ServicePro uses the camera for KYC documents and job photos.',
      NSPhotoLibraryUsageDescription: 'ServicePro uses your photos for KYC documents and job photos.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.zappyone.servicepro',
    adaptiveIcon: {
      backgroundColor: '#FFFFFF',
      foregroundImage: './assets/images/adaptive-icon.png',
    },
    // Background location and the foreground service keep an online pro's position live; the overlay is the ZappyOne bubble (modules/zappy-bubble).
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'SYSTEM_ALERT_WINDOW', 'CAMERA', 'POST_NOTIFICATIONS'],
    // Merged in by libraries but never used: broad storage (photos use the system picker) and the microphone.
    blockedPermissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.RECORD_AUDIO'],
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' } },
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    'expo-font',
    // Release builds are shrunk and obfuscated (R8), as Google Play asks.
    ['expo-build-properties', { android: { enableProguardInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true } }],
    ['expo-splash-screen', { image: './assets/images/splash.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#FFFFFF' }],
    ['expo-location', {
      locationWhenInUsePermission: 'ServicePro uses your location to show nearby jobs and to share your trip with the customer.',
      locationAlwaysAndWhenInUsePermission: 'While you are online, ServicePro keeps your location live so nearby jobs reach you and customers see you arrive, even with the screen off.',
      isAndroidBackgroundLocationEnabled: true,
      isAndroidForegroundServiceEnabled: true,
    }],
    ['expo-camera', { cameraPermission: 'ServicePro uses the camera for KYC documents and job photos.', recordAudioAndroid: false }],
    // The job-offer ringtone (core/lib/pushNotifications OFFER_CHANNEL_ID).
    ['expo-notifications', { sounds: ['./assets/sounds/zappy_ring.wav'], color: '#1F4FD8' }],
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
