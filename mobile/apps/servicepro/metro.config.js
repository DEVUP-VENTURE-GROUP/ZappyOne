const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
// The shared source lives in mobile/packages (Rakshak, on SDK 56, uses it too), outside this SDK 58 app.
const sharedRoot = path.resolve(projectRoot, '../../packages');
const SHARED = { '@zappy/core': path.join(sharedRoot, 'core'), '@zappy/ui': path.join(sharedRoot, 'ui') };
// Bare imports made from shared files resolve as if this app made them, so they come from
// this app's node_modules (SDK 58) and never from mobile/node_modules (SDK 56).
const anchor = path.join(projectRoot, 'package.json');

const config = getDefaultConfig(projectRoot);
// SDK 58 keeps watchFolders outside the server root during export (the supported way to reach mobile/packages).
config.watchFolders = [...new Set([...(config.watchFolders || []), sharedRoot])];
// Package exports stay on: React Native 0.88 publishes subpaths such as react-native/setup-env only through exports.

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const next = upstream ?? context.resolveRequest;
  for (const [name, dir] of Object.entries(SHARED)) {
    if (moduleName === name || moduleName.startsWith(`${name}/`)) {
      return next(context, dir + moduleName.slice(name.length), platform);
    }
  }
  const fromShared = context.originModulePath.startsWith(sharedRoot + path.sep);
  if (fromShared && !moduleName.startsWith('.') && !path.isAbsolute(moduleName)) {
    return next({ ...context, originModulePath: anchor }, moduleName, platform);
  }
  return next(context, moduleName, platform);
};

// mobile/node_modules is the SDK 56 workspace (Rakshak). Nothing this app bundles may come from it.
const sdk56 = path.resolve(projectRoot, '../../node_modules') + path.sep;
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const res = resolve(context, moduleName, platform);
  if (res && res.filePath && res.filePath.startsWith(sdk56)) throw new Error(`${moduleName} resolved to the SDK 56 install (${res.filePath}) from ${context.originModulePath}`);
  return res;
};

module.exports = withNativeWind(config, { input: './global.css' });
