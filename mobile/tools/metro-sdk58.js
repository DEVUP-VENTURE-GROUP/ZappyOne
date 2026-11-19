// Metro for an SDK 58 app (customer, servicepro): shared packages resolve as the app's own files, never from the SDK 56 root install.
const path = require('path');
const { createRequire } = require('module');

module.exports = function sdk58Metro(projectRoot) {
  // Loaded through the app, so expo and nativewind come from its SDK 58 node_modules, not mobile/node_modules.
  const appRequire = createRequire(path.join(projectRoot, 'package.json'));
  const { getDefaultConfig } = appRequire('expo/metro-config');
  const { withNativeWind } = appRequire('nativewind/metro');

  const sharedRoot = path.resolve(projectRoot, '../../packages');
  const SHARED = { '@zappy/core': path.join(sharedRoot, 'core'), '@zappy/ui': path.join(sharedRoot, 'ui') };
  const anchor = path.join(projectRoot, 'package.json');

  const config = getDefaultConfig(projectRoot);
  config.watchFolders = [...new Set([...(config.watchFolders || []), sharedRoot])];

  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const next = upstream ?? context.resolveRequest;
    for (const [name, dir] of Object.entries(SHARED)) {
      if (moduleName === name || moduleName.startsWith(`${name}/`)) return next(context, dir + moduleName.slice(name.length), platform);
    }
    const fromShared = context.originModulePath.startsWith(sharedRoot + path.sep);
    if (fromShared && !moduleName.startsWith('.') && !path.isAbsolute(moduleName)) return next({ ...context, originModulePath: anchor }, moduleName, platform);
    return next(context, moduleName, platform);
  };

  const sdk56 = path.resolve(projectRoot, '../../node_modules') + path.sep;
  const resolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const res = resolve(context, moduleName, platform);
    if (res && res.filePath && res.filePath.startsWith(sdk56)) throw new Error(`${moduleName} resolved to the SDK 56 install (${res.filePath}) from ${context.originModulePath}`);
    return res;
  };

  return withNativeWind(config, { input: './global.css' });
};
