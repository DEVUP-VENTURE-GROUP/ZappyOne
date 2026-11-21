// Every iOS extension has the entry point App Store Connect requires, and iOS 18-only code is marked so (apple-targets builds app-intent extensions for iOS 17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const root = new URL('../../apps/', import.meta.url);
const targets = readdirSync(root).flatMap((app) => {
  const dir = new URL(`${app}/targets/`, root);
  return existsSync(dir) ? readdirSync(dir).map((t) => ({ app, t, dir: new URL(`${t}/`, dir) })) : [];
});
const swiftOf = (dir) => readdirSync(dir).filter((f) => f.endsWith('.swift')).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const typeOf = (dir) => /type:\s*'([^']+)'/.exec(readFileSync(new URL('expo-target.config.js', dir), 'utf8'))[1];

test('there are extensions to check', () => assert.ok(targets.length >= 6));

for (const { app, t, dir } of targets) {
  test(`${app}/${t} has its entry point`, () => {
    const swift = swiftOf(dir);
    if (typeOf(dir) === 'notification-service') assert.match(swift, /class \w+: UNNotificationServiceExtension/);
    else assert.match(swift, /@main\s+struct/);
  });
  test(`${app}/${t} marks every OpenURLIntent user as iOS 18`, () => {
    const swift = swiftOf(dir);
    if (!swift.includes('OpenURLIntent')) return;
    for (const m of swift.matchAll(/((?:@available\([^)]*\)\s*)?)struct (\w+): (AppIntent|AppShortcutsProvider)\b/g)) {
      assert.match(m[1], /iOS 18/, `${m[2]} needs @available(iOS 18.0, *)`);
    }
  });
}
