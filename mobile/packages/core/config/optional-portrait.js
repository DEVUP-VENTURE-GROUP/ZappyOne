// The apps stay upright on phones, but portrait is declared optional so Play does not hide them from devices that cannot rotate (its "required hardware feature" warning).
const { withAndroidManifest } = require('expo/config-plugins');

const PORTRAIT = 'android.hardware.screen.portrait';

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-feature'] = (manifest['uses-feature'] || []).filter((f) => f.$?.['android:name'] !== PORTRAIT);
    manifest['uses-feature'].push({ $: { 'android:name': PORTRAIT, 'android:required': 'false' } });
    return mod;
  });
};
