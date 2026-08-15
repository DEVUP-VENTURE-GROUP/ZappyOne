const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// react-native-maps ships an internal `codegenNativeComponent` import that
// Metro's package-exports resolution (on by default since SDK 52) mis-routes
// through react-native-web's dist bundle instead of react-native's real
// implementation — even on native platforms. Symptom: "(0 , _reactNativeWebDistIndex
// .codegenNativeComponent) is not a function" when any map screen loads.
// Falling back to Metro's older main-field resolution avoids the bad match.
config.resolver.unstable_enablePackageExports = false;

module.exports = withNativeWind(config, { input: "./global.css" });
