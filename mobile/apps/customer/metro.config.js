const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo detects the npm workspace and watches packages/ on its own.
const config = getDefaultConfig(__dirname);

// The catalogue photos and banners ship inside the app from the repo's global assets/web (src/lib/bundledArt.generated.ts).
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '../../../assets/web')];

// react-native-maps resolves a react-native-web build through package exports
// on native; the older main-field resolution avoids it.
config.resolver.unstable_enablePackageExports = false;

module.exports = withNativeWind(config, { input: './global.css' });
