/**
 * Every folder a screen uploads into must be one the server accepts; a
 * missing one makes that upload fail for everyone (helping item photos,
 * returns and pet before/after photos all broke this way).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const APPS = ['client', 'shared', 'rakshak', 'servicepro', 'events', 'admin'];

function sources(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('every upload folder used by an app is accepted by the server', () => {
  const { UPLOAD_FOLDERS } = require('../src/modules/user/upload.routes');
  const used = new Set();
  for (const app of APPS) {
    for (const f of sources(path.join(ROOT, app, 'src'))) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/folder(?:=|:\s?)["']([a-z][a-z/_-]*)["']/g)) used.add(m[1]);
    }
  }
  // The upload component's own default.
  used.add('uploads');
  const missing = [...used].filter((f) => !UPLOAD_FOLDERS.includes(f));
  expect(missing).toEqual([]);
});
