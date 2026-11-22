// The apps stay upright on phones, but portrait is declared optional so Play does not hide them from devices that cannot rotate (its "required hardware feature" warning).
// Each app passes its own withAndroidManifest: on EAS expo lives only in the app's node_modules, so this shared file cannot require it.

const PORTRAIT = 'android.hardware.screen.portrait';

module.exports = function withOptionalPortrait(config, withAndroidManifest) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-feature'] = (manifest['uses-feature'] || []).filter((f) => f.$?.['android:name'] !== PORTRAIT);
    manifest['uses-feature'].push({ $: { 'android:name': PORTRAIT, 'android:required': 'false' } });
    return mod;
  });
};
