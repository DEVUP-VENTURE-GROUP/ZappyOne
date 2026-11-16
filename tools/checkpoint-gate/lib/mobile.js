/**
 * The phone apps all live under mobile/, on two Expo SDK generations:
 *
 *   mobile/                 SDK 56 npm workspace: apps/rakshak, packages/core, packages/ui
 *   mobile/apps/customer    SDK 58, its own package-lock.json and node_modules
 *   mobile/apps/servicepro  SDK 58, its own package-lock.json and node_modules
 *
 * core and ui are shared: the SDK 58 apps reach them through their `shared` link
 * (-> ../../packages), so a change there is type-checked against both SDKs.
 * mobile/packages/native is linked into both SDK 58 apps. Each app is checked
 * with the TypeScript of its own install, and an app that cannot be checked is
 * a failure, never a silent pass.
 */
const fs = require('fs');
const path = require('path');

const MOBILE_APPS = [
  { name: 'customer', sdk: 58, dir: 'mobile/apps/customer', install: 'mobile/apps/customer' },
  { name: 'servicepro', sdk: 58, dir: 'mobile/apps/servicepro', install: 'mobile/apps/servicepro' },
  { name: 'rakshak', sdk: 56, dir: 'mobile/apps/rakshak', install: 'mobile' },
];
const SDK58 = MOBILE_APPS.filter((a) => a.sdk === 58);
const SHARED = /^mobile\/packages\/(core|ui)\//;
const NATIVE_PACKAGE = /^mobile\/packages\/native\//;
const TOOLS = /^mobile\/tools\//;
const DOC = /\.(md|mdx|txt)$/i;
const NATIVE = /^mobile\/.*(^|\/)(android|ios)\//;

/** Every path a change touches: new, deleted and the old side of a move (a deleted file can break an import too). */
const touchedPaths = (changed) => [...new Set(changed.flatMap((c) => [c.file, c.from].filter(Boolean)))];

/** The apps one changed path can break. */
function reach(f) {
  if (DOC.test(f) || !f.startsWith('mobile/')) return [];
  if (SHARED.test(f) || TOOLS.test(f)) return MOBILE_APPS;
  if (NATIVE_PACKAGE.test(f)) return SDK58;
  const own = MOBILE_APPS.find((a) => f.startsWith(`${a.dir}/`));
  if (own) return [own];
  // Anything else under mobile/ (its package.json, lockfile, tsconfig base) belongs to the SDK 56 workspace.
  return MOBILE_APPS.filter((a) => a.install === 'mobile');
}

/** The apps a set of changed paths can break. Documentation never triggers a check. */
function appsAffected(files) {
  const hit = new Set(files.flatMap((f) => reach(f).map((a) => a.name)));
  return MOBILE_APPS.filter((a) => hit.has(a.name));
}

/** Kotlin, Swift and Gradle sources the gate cannot compile (that needs Gradle or Xcode). */
const nativeFiles = (files) => files.filter((f) => NATIVE.test(f) && !DOC.test(f));

const tscPath = (root, app) => path.join(root, app.install, 'node_modules', 'typescript', 'bin', 'tsc');

/** Why an app cannot be type-checked here, or null when it can. */
function cannotRun(root, app) {
  if (!fs.existsSync(path.join(root, app.dir, 'tsconfig.json'))) return `${app.dir}/tsconfig.json is missing`;
  if (!fs.existsSync(path.join(root, app.install, 'package-lock.json'))) return `${app.install}/package-lock.json is missing`;
  if (!fs.existsSync(tscPath(root, app))) return `${app.install} is not installed (no node_modules/typescript); run \`npm ci\` in ${app.install}`;
  if (app.sdk === 58 && !fs.existsSync(path.join(root, app.dir, 'shared', 'core'))) {
    return `${app.dir}/shared does not reach mobile/packages (the link is missing or broken)`;
  }
  return null;
}

const tail = (text, n = 15) => (text || '').trim().split('\n').slice(-n).join('\n');

/**
 * The step's verdict from each app's run: { app, problem } when it could not run,
 * { app, res } with runAsync's result otherwise.
 */
function judge(results, natives = []) {
  const errors = [];
  const broken = [];
  for (const { app, problem, res } of results) {
    const label = `${app.name} (SDK ${app.sdk})`;
    if (problem) { broken.push(`${label}: could not type-check: ${problem}`); continue; }
    if (res.timedOut) { broken.push(`${label}: type check did not finish in time`); continue; }
    const found = `${res.stdout}`.split('\n').filter((l) => /error TS\d+/.test(l)).map((l) => `${app.name}: ${l.trim()}`);
    errors.push(...found);
    if (res.status !== 0 && !found.length) broken.push(`${label}: tsc exited ${res.status} without a type error`, '```', tail(`${res.stdout}\n${res.stderr}`), '```');
  }
  const names = results.map((r) => `${r.app.name} (SDK ${r.app.sdk})`).join(', ');
  const nativeNote = natives.length ? [`${natives.length} native Android/iOS file(s) changed; this gate does not compile them, so build with Gradle/Xcode:`, ...natives.slice(0, 10).map((f) => `\`${f}\``)] : [];
  if (errors.length || broken.length) {
    return {
      status: 'fail',
      summary: errors.length ? `${errors.length} type error(s) in the apps` : 'An app type check could not run',
      details: [...broken, ...errors.slice(0, 30), ...nativeNote],
      fix: [
        ...(errors.length ? ['Fix the types (`npx tsc --noEmit -p .` inside each app). A type error here is a crash on a phone the web build never shows.'] : []),
        ...(broken.length ? ['Install each mobile root (`npm ci` in mobile, mobile/apps/customer and mobile/apps/servicepro) and make each app\'s type check run.'] : []),
      ],
    };
  }
  if (natives.length) return { status: 'warn', summary: `Type-checked ${names}; native code changed but was not compiled`, details: nativeNote, fix: ['Build the app with Gradle/Xcode (or EAS) before merging native changes.'] };
  return { status: 'pass', summary: `Type-checked ${names}` };
}

module.exports = { MOBILE_APPS, touchedPaths, appsAffected, nativeFiles, tscPath, cannotRun, judge };
