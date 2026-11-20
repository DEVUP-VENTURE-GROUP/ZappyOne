import type { ExpoConfig } from 'expo/config';
import { withInfoPlist, type ConfigPlugin } from 'expo/config-plugins';

// expo-task-manager adds Background fetch on its own; ServicePro only runs location in the background, and Apple asks that no unused background mode be declared.
const withoutBackgroundFetch: ConfigPlugin = (c) => withInfoPlist(c, (m) => {
  m.modResults.UIBackgroundModes = (m.modResults.UIBackgroundModes as string[] | undefined)?.filter((mode) => mode !== 'fetch');
  return m;
});

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
  // 1.1.0 is the Expo SDK 58 build. runtimeVersion follows this (policy appVersion), so no SDK 56 phone (1.0.x) gets this JS over the air, and this build never takes an SDK 56 update.
  version: '1.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.zappyone.servicepro',
    // The pro's Live Activity widget extension (targets/job-activity) needs the Apple team; set APPLE_TEAM_ID in the EAS environment to build it.
    ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
    supportsTablet: false,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'ServicePro uses your location to show nearby jobs and to share your trip with the customer.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'While you are online, ServicePro uses your location in the background and with the screen locked, to send you nearby jobs and to show the customer your trip on an active job. It stops when you go offline.',
      UIBackgroundModes: ['location'],
      NSSupportsLiveActivities: true,
      // The app group the Home Screen widget reads the current job from (packages/native/ios Widget).
      ZappyAppGroup: 'group.com.zappyone.servicepro',
      NSCameraUsageDescription: 'ServicePro uses the camera for KYC documents and job photos.',
      NSPhotoLibraryUsageDescription: 'ServicePro uses your photos for KYC documents and job photos.',
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      // Job offers are time-sensitive: they ring through Focus (server notification/apns sends interruption-level time-sensitive).
      'com.apple.developer.usernotifications.time-sensitive': true,
      // Shared with the Home Screen widget (packages/native/ios Widget).
      'com.apple.security.application-groups': ['group.com.zappyone.servicepro'],
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
    // Swift extension targets in targets/ (Live Activity); only with an Apple team, so other builds are unchanged.
    ...(process.env.APPLE_TEAM_ID ? ['@bacons/apple-targets'] : []),
    'expo-dev-client',
    // No Face ID: nothing in the app asks for biometric unlock, so no Face ID description ships.
    ['expo-secure-store', { faceIDPermission: false }],
    'expo-font',
    // Release builds are shrunk and obfuscated (R8), as Google Play asks.
    ['expo-build-properties', { android: { enableProguardInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true } }],
    ['expo-splash-screen', { image: './assets/images/splash.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#FFFFFF' }],
    ['expo-location', {
      locationWhenInUsePermission: 'ServicePro uses your location to show nearby jobs and to share your trip with the customer.',
      // Background location runs only while the pro is online (captain/backgroundLocation.ts) and stops when they go offline.
      locationAlwaysAndWhenInUsePermission: 'While you are online, ServicePro uses your location in the background and with the screen locked, to send you nearby jobs and to show the customer your trip on an active job. It stops when you go offline.',
      locationAlwaysPermission: 'While you are online, ServicePro uses your location in the background and with the screen locked, to send you nearby jobs and to show the customer your trip on an active job. It stops when you go offline.',
      motionUsagePermission: false,
      isAndroidBackgroundLocationEnabled: true,
      isAndroidForegroundServiceEnabled: true,
    }],
    // Photos only: the camera never records video or sound.
    ['expo-camera', { cameraPermission: 'ServicePro uses the camera for KYC documents and job photos.', microphonePermission: false, recordAudioAndroid: false }],
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

export default withoutBackgroundFetch(config);
