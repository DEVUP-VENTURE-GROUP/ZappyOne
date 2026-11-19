import type { ExpoConfig } from 'expo/config';

/**
 * ZappyOne. Store identity, permissions and native plugins.
 * Secrets never live here: keys come from EAS environment variables.
 */
const config: ExpoConfig = {
  name: 'ZappyOne',
  slug: 'zappy',
  scheme: 'zappyone',
  // Phone apps only: no web bundle, so a browser hit on the dev server cannot fail a build.
  platforms: ['ios', 'android'],
  // 1.1.0 is the Expo SDK 58 build. runtimeVersion follows this (policy appVersion), so no SDK 56 phone (1.0.x) gets this JS over the air, and this build never takes an SDK 56 update.
  version: '1.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.zappyone.app',
    supportsTablet: false,
    // The Live Activity widget extension (targets/job-activity) needs the Apple team; set APPLE_TEAM_ID in the EAS environment to build it.
    ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
    infoPlist: {
      NSSupportsLiveActivities: true,
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
      foregroundImage: './assets/images/adaptive-icon.png',
    },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'POST_NOTIFICATIONS'],
    // Merged in by libraries but never used: overlays, and broad storage (photos use the system picker).
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.RECORD_AUDIO'],
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
    // While in use only: the customer app never tracks in the background, and uses no motion data.
    ['expo-location', {
      locationWhenInUsePermission: 'ZappyOne uses your location to find professionals near you and to track your booking.',
      locationAlwaysAndWhenInUsePermission: false,
      locationAlwaysPermission: false,
      motionUsagePermission: false,
    }],
    // Photos only: the camera never records video or sound.
    ['expo-camera', { cameraPermission: 'ZappyOne uses the camera for photos of what needs fixing.', microphonePermission: false, recordAudioAndroid: false }],
    'expo-notifications',
    ['expo-image-picker', { photosPermission: 'ZappyOne uses your photos to show what needs fixing.', microphonePermission: false }],
  ],
  // Over-the-air JavaScript fixes (eas update); native changes still need a new build.
  updates: { url: 'https://u.expo.dev/76a99e9d-8a13-418c-aa22-ca591fd5e3cf' },
  runtimeVersion: { policy: 'appVersion' },
  experiments: { typedRoutes: true },
  extra: {
    // Which ZappyOne app this is; sent to the server as X-App (core/config/env).
    app: 'customer',
      eas: { projectId: '76a99e9d-8a13-418c-aa22-ca591fd5e3cf' },
  },
  owner: 'devup-ventures-01',
};

export default config;
