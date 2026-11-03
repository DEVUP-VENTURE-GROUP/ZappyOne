// Every setup step opens its page: ServicePro (web and app) shows only the setup list until done, so a step's page must be one the gate lets through.
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const list = (src, name) => [...src.match(new RegExp(`${name}[^=]*=\\s*[\\[{]([^\\]}]*)[\\]}]`))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('each step path is open past the setup gate, on the web and in the app', () => {
  const steps = [...read('server/src/modules/onboarding/profile-check.js').matchAll(/\['(\w+)',\s*'[^']*',[^\]]*?'(\/[^']+)'\]/g)].map((m) => ({ key: m[1], path: m[2] }));
  expect(steps.length).toBeGreaterThan(10);
  const web = list(read('servicepro/src/shell/ProfileGate.jsx'), 'ALWAYS');
  const appSrc = read('mobile/apps/servicepro/src/components/ProfileGate.tsx');
  const app = list(appSrc, 'const ALWAYS');
  const mobilePath = Object.fromEntries([...appSrc.match(/MOBILE_PATH[^=]*=\s*\{([^}]*)\}/)[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  const blocked = steps.filter((s) => !web.some((p) => s.path.startsWith(p)) || !app.some((p) => (mobilePath[s.path] || s.path).startsWith(p)));
  expect(blocked).toEqual([]);
});
