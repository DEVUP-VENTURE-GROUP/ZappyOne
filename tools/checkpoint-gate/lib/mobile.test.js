// Which phone apps a change reaches, and that an app the gate cannot check is never a pass.  npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mobile = require('./mobile');
const extra = require('./extra');

const names = (files) => mobile.appsAffected(files).map((a) => a.name);
const app = (name) => mobile.MOBILE_APPS.find((a) => a.name === name);

test('customer-only change checks customer alone, with its own SDK 58 install', () => {
  assert.deepEqual(names(['mobile/apps/customer/src/features/home/HeroCarousel.tsx']), ['customer']);
  assert.equal(app('customer').sdk, 58);
  assert.equal(app('customer').install, 'mobile/apps/customer');
});

test('servicepro-only change checks servicepro alone, with its own SDK 58 install', () => {
  assert.deepEqual(names(['mobile/apps/servicepro/src/captain/backgroundLocation.ts']), ['servicepro']);
  assert.equal(app('servicepro').install, 'mobile/apps/servicepro');
});

test('servicepro native module source checks servicepro and is reported as native', () => {
  const f = 'mobile/apps/servicepro/modules/zappy-bubble/android/src/main/java/expo/modules/zappybubble/ZappyBubbleModule.kt';
  assert.deepEqual(names([f]), ['servicepro']);
  assert.deepEqual(mobile.nativeFiles([f]), [f]);
});

test('rakshak-only change checks rakshak alone, through the SDK 56 workspace', () => {
  assert.deepEqual(names(['mobile/apps/rakshak/app/worker/(tabs)/index.tsx']), ['rakshak']);
  assert.equal(app('rakshak').sdk, 56);
  assert.equal(app('rakshak').install, 'mobile');
});

test('shared core or ui change checks all three apps, across both SDKs', () => {
  assert.deepEqual(names(['mobile/packages/core/api/axiosClient.ts']), ['customer', 'servicepro', 'rakshak']);
  assert.deepEqual(names(['mobile/packages/ui/components/Input.tsx']), ['customer', 'servicepro', 'rakshak']);
});

test('mobile/packages/native change checks both SDK 58 apps, and its Kotlin is native', () => {
  const kt = 'mobile/packages/native/android/src/main/java/expo/modules/zappynative/RingNotifier.kt';
  assert.deepEqual(names([kt]), ['customer', 'servicepro']);
  assert.deepEqual(names(['mobile/packages/native/index.ts']), ['customer', 'servicepro']);
  assert.deepEqual(mobile.nativeFiles([kt, 'mobile/packages/native/index.ts']), [kt]);
});

test('documentation-only changes check nothing', () => {
  assert.deepEqual(names(['mobile/README.md', 'mobile/NATIVE.md', 'mobile/apps/customer/README.md', 'tools/checkpoint-gate/README.md']), []);
});

test('an SDK 58-only change is detected', () => {
  assert.deepEqual(names(['mobile/apps/customer/app.config.ts']), ['customer']);
  assert.deepEqual(names(['mobile/apps/servicepro/package-lock.json']), ['servicepro']);
});

test('each manifest and lockfile reaches only the apps it installs', () => {
  assert.deepEqual(names(['mobile/apps/customer/package-lock.json']), ['customer']);
  assert.deepEqual(names(['mobile/apps/customer/shared']), ['customer']);
  assert.deepEqual(names(['mobile/package.json']), ['rakshak']);
  assert.deepEqual(names(['mobile/package-lock.json']), ['rakshak']);
  assert.deepEqual(names(['server/src/app.js', 'client/src/main.jsx', 'shared/src/services/api.js']), []);
});

test('mobile/tools (api and art sync, location tests) reaches every app', () => {
  assert.deepEqual(names(['mobile/tools/sync-bundled-art.js']), ['customer', 'servicepro', 'rakshak']);
});

test('deleted files and the old side of a move count as touched', () => {
  const touched = mobile.touchedPaths([
    { status: 'D', file: 'mobile/apps/customer/src/lib/old.ts', from: null },
    { status: 'R', file: 'mobile/apps/servicepro/src/a.ts', from: 'mobile/apps/rakshak/src/a.ts' },
  ]);
  assert.deepEqual(touched.sort(), ['mobile/apps/customer/src/lib/old.ts', 'mobile/apps/rakshak/src/a.ts', 'mobile/apps/servicepro/src/a.ts']);
  assert.deepEqual(names(touched), ['customer', 'servicepro', 'rakshak']);
});

test('a move from the retired mobile-sdk58 folder checks the app it lands in', () => {
  const touched = mobile.touchedPaths([{ status: 'R', file: 'mobile/apps/customer/src/x.ts', from: 'mobile-sdk58/apps/customer/src/x.ts' }]);
  assert.deepEqual(names(touched), ['customer']);
});

/* Running the check */

function fixture({ tsconfig = true, typescript = true, lock = true, shared = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-mobile-'));
  for (const a of mobile.MOBILE_APPS) {
    fs.mkdirSync(path.join(root, a.dir), { recursive: true });
    if (tsconfig) fs.writeFileSync(path.join(root, a.dir, 'tsconfig.json'), '{}');
    if (lock) fs.writeFileSync(path.join(root, a.install, 'package-lock.json'), '{}');
    if (typescript) {
      fs.mkdirSync(path.dirname(mobile.tscPath(root, a)), { recursive: true });
      fs.writeFileSync(mobile.tscPath(root, a), '');
    }
  }
  fs.mkdirSync(path.join(root, 'mobile/packages/core'), { recursive: true });
  if (shared) for (const a of ['customer', 'servicepro']) fs.symlinkSync('../../packages', path.join(root, `mobile/apps/${a}/shared`));
  return root;
}

test('cannotRun: ready apps can run; a missing tsconfig, lockfile, install or shared link is named', (t) => {
  const ok = fixture();
  t.after(() => fs.rmSync(ok, { recursive: true, force: true }));
  for (const a of mobile.MOBILE_APPS) assert.equal(mobile.cannotRun(ok, a), null);

  const noInstall = fixture({ typescript: false });
  t.after(() => fs.rmSync(noInstall, { recursive: true, force: true }));
  assert.match(mobile.cannotRun(noInstall, app('customer')), /mobile\/apps\/customer is not installed/);
  assert.match(mobile.cannotRun(noInstall, app('rakshak')), /^mobile is not installed/);

  const noConfig = fixture({ tsconfig: false });
  t.after(() => fs.rmSync(noConfig, { recursive: true, force: true }));
  assert.match(mobile.cannotRun(noConfig, app('servicepro')), /tsconfig\.json is missing/);

  const noLock = fixture({ lock: false });
  t.after(() => fs.rmSync(noLock, { recursive: true, force: true }));
  assert.match(mobile.cannotRun(noLock, app('servicepro')), /mobile\/apps\/servicepro\/package-lock\.json is missing/);
  assert.match(mobile.cannotRun(noLock, app('rakshak')), /^mobile\/package-lock\.json is missing/);

  const noLink = fixture({ shared: false });
  t.after(() => fs.rmSync(noLink, { recursive: true, force: true }));
  assert.match(mobile.cannotRun(noLink, app('customer')), /mobile\/apps\/customer\/shared does not reach/);
  assert.equal(mobile.cannotRun(noLink, app('rakshak')), null);
});

const ran = (status, stdout = '', extraFields = {}) => ({ status, stdout, stderr: '', timedOut: false, ...extraFields });

test('judge: clean runs pass and name each app with its SDK', () => {
  const r = mobile.judge([{ app: app('customer'), res: ran(0) }, { app: app('rakshak'), res: ran(0) }]);
  assert.equal(r.status, 'pass');
  assert.match(r.summary, /customer \(SDK 58\), rakshak \(SDK 56\)/);
});

test('judge: a type error fails', () => {
  const r = mobile.judge([{ app: app('servicepro'), res: ran(2, "src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.") }]);
  assert.equal(r.status, 'fail');
  assert.match(r.details.join('\n'), /servicepro: src\/a\.ts\(1,7\): error TS2322/);
});

test('judge: never a false pass when a check cannot run, crashes or times out', () => {
  assert.equal(mobile.judge([{ app: app('customer'), problem: 'mobile/apps/customer is not installed' }]).status, 'fail');
  assert.equal(mobile.judge([{ app: app('customer'), res: ran(1, '', { stderr: 'Cannot find module' }) }]).status, 'fail');
  assert.equal(mobile.judge([{ app: app('customer'), res: ran(124, '', { timedOut: true }) }]).status, 'fail');
});

test('judge: changed native code that type-checks is a warning, not a pass', () => {
  const r = mobile.judge([{ app: app('servicepro'), res: ran(0) }], ['mobile/packages/native/android/build.gradle']);
  assert.equal(r.status, 'warn');
  assert.match(r.details.join('\n'), /does not compile them/);
});

test('cost scan sees fast timers in the phone apps', () => {
  const diff = ['+++ b/mobile/apps/customer/src/x.ts', '@@ -0,0 +1 @@', '+setInterval(() => tick(), 1000)'].join('\n');
  const { warns } = extra.costScan({ diff, live: [], root: os.tmpdir() });
  assert.equal(warns.length, 1);
  assert.match(warns[0], /mobile\/apps\/customer\/src\/x\.ts:1/);
});

test('a new SDK 58 dependency reads its licence from the app install, never the SDK 56 copy', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-deps-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (dir, licence) => { fs.mkdirSync(path.join(root, dir), { recursive: true }); fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify({ license: licence })); };
  put('mobile/apps/customer/node_modules/left-pad', 'MIT');
  put('mobile/node_modules/left-pad', 'GPL-3.0');
  put('mobile/node_modules/only-in-sdk56', 'GPL-3.0');
  const git = (cmd, ref) => (ref.startsWith('HEAD:') ? JSON.stringify({ dependencies: { 'left-pad': '1.0.0', 'only-in-sdk56': '1.0.0' } }) : '{}');
  const deps = extra.addedDependencies(git, 'base', ['mobile/apps/customer/package.json'], root);
  assert.equal(deps.find((d) => d.name === 'left-pad').licence, 'MIT');
  assert.equal(deps.find((d) => d.name === 'only-in-sdk56').licence, 'not installed');
});

test('a new Rakshak dependency reads its licence from the SDK 56 workspace', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-deps56-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'mobile/node_modules/left-pad'), { recursive: true });
  fs.writeFileSync(path.join(root, 'mobile/node_modules/left-pad/package.json'), JSON.stringify({ license: 'ISC' }));
  const git = (cmd, ref) => (ref.startsWith('HEAD:') ? JSON.stringify({ dependencies: { 'left-pad': '1.0.0' } }) : '{}');
  const [dep] = extra.addedDependencies(git, 'base', ['mobile/apps/rakshak/package.json'], root);
  assert.equal(dep.licence, 'ISC');
});
