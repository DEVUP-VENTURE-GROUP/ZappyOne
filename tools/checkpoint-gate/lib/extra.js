// The gate's checks beyond lint: coverage on new code, flaky-test retry, app type checks, dependencies and running cost.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Every step has a time limit: a step that hangs is stopped and reported, never left to hold the gate for hours.
function runAsync(cmd, args, cwd, timeoutMs = 25 * 60 * 1000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') require('child_process').spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      else child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => { clearTimeout(timer); resolve({ status: timedOut ? 124 : status, timedOut, stdout, stderr }); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ status: 1, timedOut, stdout, stderr: `${stderr}\n${err.message}` }); });
  });
}

// Test files jest reports as failed ("FAIL tests/x.test.js").
const failedTestFiles = (out) => [...new Set([...out.matchAll(/^\s*FAIL\s+(\S+\.test\.js)/gm)].map((m) => m[1].split(path.sep).join('/')))];

// Of the statements on lines this PR added in server code, how many the tests ran (jest's coverage-final.json).
function newCodeCoverage(coverageFile, serverRoot, isAdded) {
  if (!fs.existsSync(coverageFile)) return null;
  const data = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
  let total = 0;
  let covered = 0;
  const files = [];
  for (const [abs, f] of Object.entries(data)) {
    const rel = `server/${path.relative(serverRoot, abs).split(path.sep).join('/')}`;
    let t = 0;
    let c = 0;
    for (const [id, loc] of Object.entries(f.statementMap)) {
      if (!isAdded(rel, loc.start.line)) continue;
      t += 1;
      if (f.s[id] > 0) c += 1;
    }
    if (t) files.push({ file: rel, total: t, covered: c });
    total += t;
    covered += c;
  }
  return { total, covered, pct: total ? Math.round((covered * 1000) / total) / 10 : 100, files };
}

// Running cost on the lines a PR adds: polling, unbounded queries, heavy images.
function costScan({ diff, live, root }) {
  const fails = [];
  const warns = [];
  let file = null;
  let lineNo = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6) : null; continue; }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) { lineNo = Number(hunk[1]); continue; }
    if (!file || !line.startsWith('+') || line.startsWith('+++')) continue;
    const code = line.slice(1);
    const at = `\`${file}:${lineNo}\``;
    const poll = code.match(/pollingInterval:\s*(\d[\d_]*)/);
    if (poll && Number(poll[1].replace(/_/g, '')) < 60000) fails.push(`${at} polls every ${Number(poll[1].replace(/_/g, '')) / 1000}s: faster than once a minute costs a request per open screen per poll`);
    const live = code.match(/useLivePoll\((\d[\d_]*)\)/);
    if (live && Number(live[1].replace(/_/g, '')) < 30000) warns.push(`${at} polls every ${Number(live[1].replace(/_/g, '')) / 1000}s while the live connection is down`);
    const timer = code.match(/setInterval\([^,]+,\s*(\d[\d_]*)\)/);
    if (timer && Number(timer[1].replace(/_/g, '')) < 5000 && /^(client|servicepro|admin|shared|mobile)\//.test(file)) warns.push(`${at} runs a timer every ${Number(timer[1].replace(/_/g, ''))}ms: make sure it does no network work`);
    if (/^server\/src\//.test(file) && /\.find\((?!One)/.test(code) && !/\.limit\(|\.countDocuments|findById|\.find\(\s*\)\s*;?\s*\/\/\s*bounded/.test(code) && !/\[\]\.find\(|\.find\(\(|\.find\([a-z]+\s*=>/.test(code)) {
      warns.push(`${at} reads from the database with no .limit(): fine for a handful of rows, a full scan at scale`);
    }
    lineNo += 1;
  }
  for (const f of live) {
    if (!/\.(png|jpe?g|gif|webp)$/i.test(f)) continue;
    const size = fs.existsSync(path.join(root, f)) ? fs.statSync(path.join(root, f)).size : 0;
    if (size > 400 * 1024) fails.push(`\`${f}\` is ${Math.round(size / 1024)} KB: every phone downloads it; resize or convert to WebP under 400 KB`);
  }
  return { fails, warns };
}

// New dependencies in any package.json the PR changes, with their licence from node_modules.
function addedDependencies(git, baseSha, changedFiles, root) {
  const out = [];
  for (const f of changedFiles.filter((x) => /(^|\/)package\.json$/.test(x) && !/node_modules/.test(x))) {
    const read = (ref) => { try { return JSON.parse(git('show', `${ref}:${f}`)); } catch { return {}; } };
    const before = read(baseSha);
    const after = read('HEAD');
    const deps = (p) => ({ ...(p.dependencies || {}), ...(p.devDependencies || {}) });
    const old = deps(before);
    for (const [name, range] of Object.entries(deps(after))) {
      if (old[name]) continue;
      const dirs = [path.join(root, path.dirname(f), 'node_modules', name), path.join(root, 'mobile', 'node_modules', name), path.join(root, 'node_modules', name)];
      const pkg = dirs.map((d) => path.join(d, 'package.json')).find((p) => fs.existsSync(p));
      const licence = pkg ? (JSON.parse(fs.readFileSync(pkg, 'utf8')).license || 'unknown') : 'not installed';
      out.push({ file: f, name, range, licence: typeof licence === 'string' ? licence : licence.type || 'unknown' });
    }
  }
  return out;
}

// High and critical advisories from `npm audit --package-lock-only` for one folder.
async function auditHigh(dir) {
  if (!fs.existsSync(path.join(dir, 'package-lock.json'))) return null;
  // npm's advisory service can be slow or unreachable: 90 s, then 'not checked' rather than a stuck gate.
  const res = await runAsync('npm', ['audit', '--package-lock-only', '--json', '--omit=dev'], dir, 90 * 1000);
  if (res.timedOut) return null;
  try {
    const data = JSON.parse(res.stdout);
    return Object.entries(data.vulnerabilities || {}).filter(([, v]) => ['high', 'critical'].includes(v.severity)).map(([name, v]) => `${name} (${v.severity})`);
  } catch { return null; }
}

// The test files that use a changed server file directly: they require its path or name. A changed test file runs itself.
// Through app.js every route reaches every test, so the import graph would pick the whole suite; direct use is the right signal for a PR.
function selectTests(changed, serverRoot, max = 25) {
  const testsDir = path.join(serverRoot, 'tests');
  if (!fs.existsSync(testsDir)) return [];
  const all = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.js'));
  const text = new Map(all.map((f) => [f, fs.readFileSync(path.join(testsDir, f), 'utf8')]));
  const picked = new Set(changed.filter((f) => /^server\/tests\/.*\.test\.js$/.test(f)).map((f) => path.basename(f)));
  for (const f of changed.filter((x) => /^server\/src\/.*\.js$/.test(x))) {
    const rel = f.replace(/^server\/src\//, '').replace(/\.js$/, '');
    const base = path.basename(rel);
    // Also its last two path parts without the role suffix (provider/pricing): tests call controllers and routes by URL.
    const tail = rel.split('/').slice(-2).join('/').replace(/\.(controller|service|routes|model|worker)$/, '');
    const needles = [rel, `/${base}'`, `/${base}"`, `/${base}.js'`, `/${base}.js"`, ...(tail.includes('/') ? [tail] : [])];
    const byFile = all.filter((t) => needles.some((k) => text.get(t).includes(k)));
    const mod = (rel.match(/^modules\/([^/]+)\//) || [])[1];
    const byModule = byFile.length || !mod ? [] : all.filter((t) => text.get(t).includes(`modules/${mod}/`));
    for (const t of [...byFile, ...byModule]) picked.add(t);
  }
  return [...picked].slice(0, max).map((t) => `tests/${t}`);
}

module.exports = { selectTests, runAsync, failedTestFiles, newCodeCoverage, costScan, addedDependencies, auditHigh };
