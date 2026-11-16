const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo detects the npm workspace and watches packages/ on its own.
const config = getDefaultConfig(__dirname);

// react-native-maps resolves a react-native-web build through package exports
// on native; the older main-field resolution avoids it.
config.resolver.unstable_enablePackageExports = false;

module.exports = withNativeWind(config, { input: './global.css' });
