#!/usr/bin/env node
/**
 * Checkpoint gate — verify a pull request into checkpoint-main. It never fixes
 * anything: it measures, compares the PR against its base, and says PASS or
 * FAIL with what has to change.
 *
 *   node tools/checkpoint-gate/run.js [--base origin/checkpoint-main] [--out gate-report]
 *        [--pr-body-file body.md] [--skip-tests] [--skip-build]
 *
 * Writes report.md, report.html and report.json to --out, and exits 1 on FAIL.
 * Rules that judge code quality fail only on what the PR ADDS; debt that was
 * already on the base is shown but not blamed on this PR.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync, spawnSync } = require('child_process');
const reach = require('./lib/reach');
const { renderMarkdown, renderHtml } = require('./lib/report');

const ROOT = path.resolve(__dirname, '../..');
const WEB_APPS = reach.WEB_APPS;
const CODE = /\.(jsx?|mjs|cjs)$/;
const SCANNED = /^(client|servicepro|admin|events|shared|server)\//;

/* Arguments */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE_REF = opt('base', 'origin/checkpoint-main');
const OUT = path.resolve(ROOT, opt('out', 'gate-report'));
const PR_BODY_FILE = opt('pr-body-file', null);

/* Helpers */

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const run = (cmd, args, cwd) => spawnSync(cmd, args, {
  cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024,
});
const lastLines = (text, n = 25) => (text || '').trim().split('\n').slice(-n).join('\n');
const kb = (bytes) => Math.round(bytes / 102.4) / 10;

const checks = [];
const quality = require('./lib/quality');
const extra = require('./lib/extra');
let coveragePct = null;
let dupPct = null;
let newIssues = { bugs: 0, vulns: 0, smells: 0, hotspots: 0 };
function check(id, title, status, summary, { details = [], fix = [] } = {}) {
  checks.push({ id, title, status, summary, details, fix });
}

/* What changed */

const baseSha = git('merge-base', BASE_REF, 'HEAD');
const headSha = git('rev-parse', 'HEAD');

const changed = git('diff', '--name-status', '-M', baseSha, 'HEAD').split('\n').filter(Boolean).map((line) => {
  const parts = line.split('\t');
  return { status: parts[0][0], file: parts[parts.length - 1], from: parts[0][0] === 'R' ? parts[1] : null };
});
/** A moved file's path before this change, so its old issues are not counted as new. */
const priorPath = new Map(changed.filter((c) => c.from).map((c) => [c.file, c.from]));
const live = changed.filter((c) => c.status !== 'D').map((c) => c.file);

const numstat = git('diff', '--numstat', '-M', baseSha, 'HEAD').split('\n').filter(Boolean);
let added = 0;
let removed = 0;
for (const line of numstat) {
  const [a, r] = line.split('\t');
  if (a !== '-') added += Number(a);
  if (r !== '-') removed += Number(r);
}

/** Line numbers each file gained, from a zero-context diff. */
const addedLines = new Map();
{
  let file = null;
  for (const line of git('diff', '-U0', '-M', baseSha, 'HEAD').split('\n')) {
    if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6) : null; continue; }
    const hunk = file && line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!hunk) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (!addedLines.has(file)) addedLines.set(file, new Set());
    for (let i = 0; i < count; i++) addedLines.get(file).add(start + i);
  }
}
const isAdded = (file, line) => addedLines.get(file)?.has(line) || false;

const commits = git('log', '--format=%H%x1f%an%x1f%s%x1f%B%x1e', `${baseSha}..HEAD`)
  .split('\x1e').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [sha, author, subject, body] = s.split('\x1f'); return { sha, author, subject, body }; });

/* The base, checked out beside the PR for before/after comparisons */

const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-base-'));
// Only the code folders the comparisons read, exported (git archive) rather than checked out: seconds, and the repo is never touched.
{
  const tarFile = path.join(os.tmpdir(), `gate-base-${process.pid}.tar`);
  const paths = ['client/src', 'servicepro/src', 'admin/src', 'shared/src', 'server/src', 'mobile/apps', 'mobile/packages', ':(glob)**/package.json', ':(glob)**/package-lock.json']
    .filter((p) => p.startsWith(':') || git('ls-tree', '--name-only', baseSha, p));
  execFileSync('git', ['archive', '--format=tar', '-o', tarFile, baseSha, ...paths], { cwd: ROOT });
  // A relative path: GNU tar reads a Windows drive letter (C:) as a remote host.
  execFileSync('tar', ['-xf', path.relative(baseDir, tarFile)], { cwd: baseDir });
  fs.rmSync(tarFile, { force: true });
}

async function main() {
  // 1. Forbidden files
  {
    const rules = [
      [/(^|\/)\.env(?!.*\.(example|sample|template)$)[^/]*$/, 'environment file (secrets live outside git)'],
      [/\.(pem|key|p12|pfx)$|(^|\/)id_(rsa|ed25519)/, 'private key or certificate'],
      [/(^|\/)(\.claude|\.cursor|\.aider[^/]*)(\/|$)|(^|\/)(CLAUDE|AGENTS|GEMINI)\.md$|copilot-instructions\.md$/, 'AI tool configuration (kept outside the repo)'],
      [/(^|\/)(node_modules|dist|build|coverage)\//, 'generated output'],
    ];
    const hits = [];
    for (const file of live) for (const [re, why] of rules) if (re.test(file)) hits.push(`\`${file}\` — ${why}`);
    check('files', 'Forbidden files', hits.length ? 'fail' : 'pass',
      hits.length ? `${hits.length} file(s) that must not be committed` : 'No secrets, keys, build output or AI tool config added',
      { details: hits, fix: hits.length ? ['Remove these files from the PR (git rm --cached) and keep them out with .gitignore.'] : [] });
  }

  // 2. Secrets in added lines
  {
    const patterns = [
      [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
      [/mongodb(\+srv)?:\/\/[^\s:/'"]+:[^\s@'"]+@/, 'database URI with a password'],
      [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
      [/\b(sk|rk)_live_[0-9a-zA-Z]{16,}/, 'live payment key'],
      [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
      [/gh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
      [/xox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
    ];
    const hits = [];
    let file = null;
    let lineNo = 0;
    for (const line of git('diff', '-U0', baseSha, 'HEAD').split('\n')) {
      if (line.startsWith('+++ ')) { file = line.slice(6); continue; }
      const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      if (hunk) { lineNo = Number(hunk[1]); continue; }
      if (line.startsWith('+') && !line.startsWith('+++')) {
        for (const [re, what] of patterns) if (re.test(line)) hits.push(`\`${file}:${lineNo}\` — looks like a ${what}`);
        lineNo++;
      }
    }
    check('secrets', 'Secrets in code', hits.length ? 'fail' : 'pass',
      hits.length ? `${hits.length} possible secret(s) in added lines` : 'No keys, tokens or passwords in added lines',
      { details: hits, fix: hits.length ? ['Move the value to an environment variable, remove it from the branch history, and rotate the credential — treat it as leaked.'] : [] });
  }

  // 3-4b. Server tests (with coverage of new code), web builds and app type checks run side by side.
  const serverSrc = live.filter((f) => /^server\/src\/.*\.js$/.test(f) && !/(seed|migrations)\//.test(f));
  const FULL = flag('full');
  // Tests jest links to the changed server files by following imports, plus any test the PR touched; --full runs them all.
  const serverTouched = live.filter((f) => /^server\/(src|tests)\/.*\.js$/.test(f) || /^server\/package(-lock)?\.json$/.test(f));
  const selected = FULL ? [] : extra.selectTests(serverTouched, path.join(ROOT, 'server'));
  const relatedArgs = FULL ? [] : selected;
  // An app is built when its own code changes; shared code or assets build all three; --full builds all.
  const appsToBuild = FULL ? WEB_APPS : WEB_APPS.filter((a) => live.some((f) => f.startsWith(`${a}/`) || /^(shared|assets)\//.test(f)));
  const covDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-cov-'));
  async function testsStep() {
    if (flag('skip-tests')) return { status: 'info', summary: 'Skipped (--skip-tests)' };
    if (!FULL && !serverTouched.length) return { status: 'pass', summary: 'No server code changed (run --full for the whole suite)' };
    if (!FULL && !selected.length) return { status: 'warn', summary: 'Server code changed but no test uses it directly', fix: ['Add a test in server/tests for the changed code, or run the gate with --full.'] };
    const serverDir = path.join(ROOT, 'server');
    const cov = serverSrc.length
      ? ['--coverage', '--coverageReporters=json', `--coverageDirectory=${covDir}`, ...serverSrc.map((f) => `--collectCoverageFrom=${f.replace(/^server\//, '')}`)]
      : [];
    const res = await extra.runAsync('npm', ['test', '--', '--silent', ...relatedArgs, ...cov], serverDir, 40 * 60 * 1000);
    if (res.timedOut) return { status: 'fail', summary: 'Server tests did not finish in 40 minutes', fix: ['Find the hanging test (`cd server && npm test`); a test left waiting on a timer or connection holds the whole run.'] };
    const out = `${res.stdout}\n${res.stderr}`;
    const summary = (out.match(/^Tests:.*$/m) || ['Tests: no summary'])[0].replace(/^Tests:\s*/, '');
    if (res.status === 0) return { status: 'pass', summary: FULL ? `${summary} · whole suite` : `${summary} · ${selected.length} test file(s) that use the changed code` };
    // A file that fails only while ~2,000 tests share the machine is retried alone: a pass means load, not a bug.
    const files = extra.failedTestFiles(out);
    const failed = [...new Set([...out.matchAll(/^\s*● (.+)$/gm)].map((m) => m[1]).filter((t) => !/Validation Warning/.test(t)))];
    if (files.length && files.length <= 10) {
      const retry = await extra.runAsync('npx', ['jest', ...files, '--maxWorkers=2', '--silent'], serverDir);
      if (retry.status === 0) {
        return { status: 'warn', summary: `${summary} · ${files.length} file(s) failed under load and passed on a calm retry`,
          details: files.map((f) => `flaky under load: \`server/${f}\``), fix: ['Make these tests independent of timing (raise their timeout or wait on the condition, not the clock).'] };
      }
    }
    return { status: 'fail', summary: FULL ? summary : `${summary} (${selected.length} test file(s) that use the changed code)`, details: failed.slice(0, 30).map((t) => `✗ ${t}`).concat(failed.length ? [] : ['```', lastLines(out), '```']),
      fix: ['Make every server test pass (`cd server && npm test`).'] };
  }
  async function buildStep() {
    if (flag('skip-build')) return { status: 'info', summary: 'Skipped (--skip-build)' };
    const budgets = JSON.parse(fs.readFileSync(path.join(__dirname, 'budgets.json'), 'utf8'));
    const results = [];
    if (!appsToBuild.length) return { status: 'pass', summary: 'No web app code changed' };
    for (const app of appsToBuild) results.push({ app, res: await extra.runAsync('npx', ['vite', 'build', '--logLevel', 'error'], path.join(ROOT, app), 10 * 60 * 1000) });
    const rows = [];
    const fix = [];
    let worst = 'pass';
    for (const { app, res } of results) {
      const dir = path.join(ROOT, app);
      if (res.status !== 0) {
        worst = 'fail';
        rows.push(`**${app}** — build failed`, '```', lastLines(`${res.stdout}\n${res.stderr}`, 15), '```');
        fix.push(`Fix the ${app} build (\`cd ${app} && npx vite build\`).`);
        continue;
      }
      let raw = 0;
      let gz = 0;
      const walk = (d) => {
        for (const n of fs.readdirSync(d)) {
          const p2 = path.join(d, n);
          if (fs.statSync(p2).isDirectory()) walk(p2);
          else if (/\.(js|css)$/.test(n)) { const buf = fs.readFileSync(p2); raw += buf.length; gz += zlib.gzipSync(buf, { level: 9 }).length; }
        }
      };
      walk(path.join(dir, 'dist'));
      const budget = budgets[app];
      const over = budget && kb(gz) > budget;
      if (over) { worst = 'fail'; fix.push(`${app} ships ${kb(gz)} KB gzipped, over its ${budget} KB budget — lazy-load the new code or drop a dependency. Raise the budget in tools/checkpoint-gate/budgets.json only with a reason in the PR.`); }
      rows.push(`${over ? '✗' : '✓'} **${app}** — ${kb(raw)} KB raw · **${kb(gz)} KB gzipped**${budget ? ` (budget ${budget} KB)` : ''}`);
    }
    return { status: worst, summary: worst === 'pass' ? `${appsToBuild.join(', ')} build and stay within their gzip budgets` : 'A build failed or an app grew past its budget', details: rows, fix };
  }
  async function typesStep() {
    if (!live.some((f) => /^mobile\//.test(f))) return { status: 'pass', summary: 'No app code changed' };
    const apps = ['customer', 'servicepro'].filter((a) => fs.existsSync(path.join(ROOT, 'mobile/apps', a, 'tsconfig.json')));
    const results = [];
    for (const a of apps) results.push({ a, res: await extra.runAsync('npx', ['tsc', '--noEmit', '-p', '.'], path.join(ROOT, 'mobile/apps', a), 10 * 60 * 1000) });
    const errors = results.flatMap(({ a, res }) => `${res.stdout}`.split('\n').filter((l) => /error TS\d+/.test(l)).map((l) => `${a}: ${l.trim()}`));
    return errors.length
      ? { status: 'fail', summary: `${errors.length} type error(s) in the apps`, details: errors.slice(0, 30), fix: ['Fix the types (`npx tsc --noEmit -p .` inside each app). A type error here is a crash on a phone the web build never shows.'] }
      : { status: 'pass', summary: `Both apps type-check (${apps.join(', ')})` };
  }
  // Two lanes, not six jobs at once: tests in one, builds then app type checks in the other (one machine, not a cluster).
  // Each step's own time is in its summary, so a slow step shows itself.
  const timed = async (fn) => { const t0 = Date.now(); const r = await fn(); const sec = Math.round((Date.now() - t0) / 1000); return { ...r, summary: `${r.summary} · ${sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`}` }; };
  const [tests, [build, types]] = await Promise.all([timed(testsStep), timed(buildStep).then(async (b) => [b, await timed(typesStep)])]);
  check('tests', 'Server tests', tests.status, tests.summary, tests);
  check('build', 'Build every app · compressed size', build.status, build.summary, build);
  check('types', 'App type check (iOS + Android)', types.status, types.summary, types);

  // 4c. Coverage of new server code (SonarQube's gate asks 80%).
  {
    const cov = flag('skip-tests') || !serverSrc.length ? null : extra.newCodeCoverage(path.join(covDir, 'coverage-final.json'), path.join(ROOT, 'server'), isAdded);
    if (!cov) check('coverage', 'Coverage on new code', 'info', flag('skip-tests') ? 'Not measured (--skip-tests)' : 'No server code changed');
    else {
      const low = cov.total > 0 && cov.pct < 80;
      check('coverage', 'Coverage on new code', low ? 'fail' : 'pass',
        cov.total ? `${cov.pct}% of ${cov.total} new server statement(s) run by tests (needs 80%)` : 'No new executable server lines',
        { details: cov.files.sort((x, y) => x.covered / x.total - y.covered / y.total).slice(0, 15).map((f) => `\`${f.file}\` — ${f.covered}/${f.total} new statements tested`),
          fix: low ? ['Add tests in server/tests that run the new code paths, including the failure branches.'] : [] });
      coveragePct = cov.total ? cov.pct : null;
    }
    fs.rmSync(covDir, { recursive: true, force: true });
  }

  // 5. Quality on new code, SonarQube-style: reliability, security, hotspots, maintainability, accessibility
  const codeFiles = live.filter((f) => CODE.test(f) && SCANNED.test(f) && !/(^|\/)(seed|migrations)\//.test(f));
  const { ESLint } = require('eslint');
  const lintAt = async (cwd, files) => {
    const present = files.filter((f) => fs.existsSync(path.join(cwd, f)));
    if (!present.length) return [];
    const eslint = new ESLint({ cwd, overrideConfigFile: path.join(__dirname, 'eslint.config.mjs'), errorOnUnmatchedPattern: false });
    const results = await eslint.lintFiles(present);
    return results.flatMap((r) => r.messages.filter((m) => m.ruleId).map((m) => ({
      file: path.relative(cwd, r.filePath).split(path.sep).join('/'), rule: m.ruleId, line: m.line, message: m.message,
    })));
  };
  {
    const basePaths = codeFiles.map((f) => priorPath.get(f) || f);
    const newPathOf = new Map(codeFiles.map((f, i) => [basePaths[i], f]));
    const [head, baseRaw] = await Promise.all([lintAt(ROOT, codeFiles), lintAt(baseDir, basePaths)]);
    const base = baseRaw.map((v) => ({ ...v, file: newPathOf.get(v.file) || v.file }));
    const count = (list) => list.reduce((m, v) => m.set(`${v.file}|${v.rule}`, (m.get(`${v.file}|${v.rule}`) || 0) + 1), new Map());
    const before = count(base);
    const after = count(head);
    const fresh = [];
    for (const [key, n] of after) {
      const extra = n - (before.get(key) || 0);
      if (extra <= 0) continue;
      const [file, rule] = key.split('|');
      // Point at the ones on lines this PR wrote, where the new violation must be.
      const candidates = head.filter((v) => v.file === file && v.rule === rule)
        .sort((a, b) => Number(isAdded(b.file, b.line)) - Number(isAdded(a.file, a.line)));
      fresh.push(...candidates.slice(0, extra));
    }
    const by = (cat) => fresh.filter((v) => quality.categoryOf(v.rule) === cat);
    const older = (cat) => head.filter((v) => quality.categoryOf(v.rule) === cat).length - by(cat).length;
    const line = (v) => `\`${v.file}:${v.line}\` **${v.rule}** — ${v.message}`;
    const CATS = [
      ['reliability', 'Reliability · bugs', 'fail', 'new bug(s)', 'No new bugs', 'Fix each one: an undefined name, a broken hook or an impossible condition is a crash or a wrong result waiting to happen.'],
      ['security', 'Security · vulnerabilities', 'fail', 'new vulnerability(ies)', 'No new vulnerabilities', 'Remove eval and shell calls on user input, move passwords and addresses to configuration, and make regexes linear.'],
      ['hotspot', 'Security hotspots · to review', 'warn', 'hotspot(s) to review', 'No new hotspots', 'Check each one is safe here (randomness that guards nothing, hashing that is not for passwords, sanitised HTML) and say so in the PR.'],
      ['maintainability', 'Maintainability · code smells', 'fail', 'new code smell(s)', 'No new code smells', 'Split long or branchy functions (cognitive complexity over 15), reuse identical functions, flatten nesting and delete values that are never read.'],
      ['a11y', 'Accessibility', 'fail', 'new accessibility issue(s)', 'No new accessibility issues', 'Give images alt text, links and headings real content, and use valid ARIA roles and properties.'],
    ];
    for (const [cat, title, level, many, none, fix] of CATS) {
      const list = by(cat);
      const old = older(cat);
      check(cat, title, list.length ? level : 'pass',
        list.length ? `${list.length} ${many} in ${new Set(list.map((v) => v.file)).size} file(s)` : `${none}${old ? ` · ${old} older in touched files` : ''}`,
        { details: list.slice(0, 40).map(line), fix: list.length ? [fix] : [] });
    }
    newIssues = { bugs: by('reliability').length, vulns: by('security').length, smells: by('maintainability').length, hotspots: by('hotspot').length };
  }

  // 6. Complexity of the functions this PR wrote or changed (measurement)
  {
    const eslint = new ESLint({
      cwd: ROOT,
      overrideConfigFile: true,
      overrideConfig: [{
        files: ['**/*.{js,jsx,mjs,cjs}'],
        linterOptions: { reportUnusedDisableDirectives: 'off', noInlineConfig: true },
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { complexity: ['warn', 0] },
      }],
    });
    const results = codeFiles.length ? await eslint.lintFiles(codeFiles.filter((f) => fs.existsSync(path.join(ROOT, f)))) : [];
    const fns = [];
    for (const r of results) {
      const file = path.relative(ROOT, r.filePath).split(path.sep).join('/');
      for (const m of r.messages) {
        const c = m.message.match(/complexity of (\d+)/);
        if (c && isAdded(file, m.line)) fns.push({ file, line: m.line, n: Number(c[1]), name: (m.message.match(/^(.*?) has a complexity/) || [])[1] || 'function' });
      }
    }
    fns.sort((a, b) => b.n - a.n);
    const avg = fns.length ? Math.round((fns.reduce((s, f) => s + f.n, 0) / fns.length) * 10) / 10 : 0;
    const high = fns.filter((f) => f.n > 10).length;
    check('complexity', 'Complexity of new/changed functions', 'info',
      fns.length ? `${fns.length} function(s) · average ${avg} · highest ${fns[0].n} · ${high} above 10` : 'No functions added or changed',
      { details: fns.slice(0, 10).map((f) => `${f.n} — ${f.name} \`${f.file}:${f.line}\``) });
  }

  // 7. Duplicated code the PR adds
  {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-cpd-'));
    // The gate's own copy (tools/checkpoint-gate/node_modules); its package.json is not exported.
    const jscpdDir = path.join(__dirname, 'node_modules', 'jscpd');
    const { bin } = JSON.parse(fs.readFileSync(path.join(jscpdDir, 'package.json'), 'utf8'));
    const jscpd = path.join(jscpdDir, typeof bin === 'string' ? bin : bin.jscpd);
    const dirs = [...WEB_APPS.map((a) => `${a}/src`), 'shared/src', 'server/src'].filter((d) => fs.existsSync(path.join(ROOT, d)));
    run(process.execPath, [jscpd, ...dirs, '--min-lines', '12', '--min-tokens', '80', '--format', 'javascript,jsx',
      '--ignore', '**/node_modules/**,**/dist/**,**/seed/**,**/migrations/**,**/*.test.js',
      '--reporters', 'json', '--output', outDir, '--silent'], ROOT);
    const reportFile = path.join(outDir, 'jscpd-report.json');
    const data = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : { duplicates: [], statistics: { total: {} } };
    const span = (f) => ({ file: f.name.split(path.sep).join('/'), start: f.start ?? f.startLoc?.line, end: f.end ?? f.endLoc?.line });
    const mostlyNew = (s) => {
      let n = 0;
      for (let l = s.start; l <= s.end; l++) if (isAdded(s.file, l)) n++;
      return n >= (s.end - s.start + 1) / 2;
    };
    const fresh = data.duplicates.map((d) => [span(d.firstFile), span(d.secondFile), d.lines])
      .filter(([a, b]) => mostlyNew(a) || mostlyNew(b));
    const pct = data.statistics?.total?.percentage;
    const dupNew = fresh.reduce((n, [, , lines]) => n + lines, 0);
    dupPct = added ? Math.round((dupNew * 1000) / added) / 10 : 0;
    check('duplicates', 'Duplicated code', fresh.length ? 'fail' : 'pass',
      `${fresh.length ? `${fresh.length} new copy-paste block(s)` : 'No new copy-paste blocks'}${pct != null ? ` · whole codebase ${Math.round(pct * 10) / 10}% duplicated` : ''}`,
      {
        details: fresh.slice(0, 25).map(([a, b, lines]) => `${lines} lines: \`${a.file}:${a.start}-${a.end}\` ≈ \`${b.file}:${b.start}-${b.end}\``),
        fix: fresh.length ? ['Use the existing code instead of copying it — extract a shared function or component and call it from both places.'] : [],
      });
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  // 8. Unused files and API endpoints the PR leaves behind
  {
    const diff = (a, b) => a.filter((x) => !new Set(b).has(x));
    const webNew = diff(reach.unreachableWeb(ROOT), reach.unreachableWeb(baseDir));
    const serverNew = diff(reach.unreachableServer(ROOT), reach.unreachableServer(baseDir));
    const hooksNew = diff(reach.unusedApiHooks(ROOT), reach.unusedApiHooks(baseDir));
    const total = webNew.length + serverNew.length + hooksNew.length;
    check('unused', 'Unused components and endpoints', total ? 'fail' : 'pass',
      total ? `${total} new unused file(s) or API hook(s)` : 'Every file is reachable and every API hook is used',
      {
        details: [
          ...webNew.map((f) => `front-end file no app imports: \`${f}\``),
          ...serverNew.map((f) => `server file nothing requires: \`${f}\``),
          ...hooksNew.map((h) => `API hook no screen calls: \`${h}\``),
        ],
        fix: total ? ['Delete what nothing uses, or wire it in. Replaced code must be removed in the same PR, not left beside the new version.'] : [],
      });
  }

  // 8b. Screens calling API hooks that do not exist (crash on open, invisible to the build)
  {
    const missing = reach.missingApiHooks(ROOT);
    check('api-wiring', 'Screens wired to real API hooks', missing.length ? 'fail' : 'pass',
      missing.length ? `${missing.length} imported hook(s) the API client does not define` : 'Every API hook a screen imports exists',
      {
        details: missing.map((m) => `\`${m}\``),
        fix: missing.length ? ['Add the endpoint to shared/src/services/api.js (and export its hook), or remove the import. The build cannot catch this; the screen crashes when opened.'] : [],
      });
  }

  // 8c. Running cost: polling, unbounded reads and heavy images the PR adds (beyond SonarQube).
  {
    const { fails, warns } = extra.costScan({ diff: git('diff', '-U0', baseSha, 'HEAD'), live, root: ROOT });
    check('cost', 'Running cost', fails.length ? 'fail' : warns.length ? 'warn' : 'pass',
      fails.length || warns.length ? `${fails.length} costly change(s), ${warns.length} to check` : 'No new polling, unbounded reads or heavy images',
      { details: [...fails, ...warns.map((w) => `check: ${w}`)].slice(0, 30),
        fix: fails.length ? ['Poll at most once a minute (use the live connection and useLivePoll), bound every list read with .limit(), and keep images under 400 KB (WebP).'] : [] });
  }

  // 8d. Dependencies: known high or critical vulnerabilities the PR brings in, and licences we cannot ship.
  {
    const deps = extra.addedDependencies(git, baseSha, live, ROOT);
    const lockDirs = [...new Set(live.filter((f) => /(^|\/)package-lock\.json$/.test(f)).map((f) => path.dirname(f)))];
    const newAdvisories = [];
    for (const d of lockDirs) {
      const [now, was] = await Promise.all([extra.auditHigh(path.join(ROOT, d)), extra.auditHigh(path.join(baseDir, d))]);
      if (now) newAdvisories.push(...now.filter((x) => !(was || []).includes(x)).map((x) => `\`${d}\`: ${x}`));
    }
    const badLicence = deps.filter((x) => /(^|[^L])GPL|AGPL|SSPL|BUSL|unknown|not installed/i.test(x.licence));
    const fail = newAdvisories.length || badLicence.some((x) => !/not installed|unknown/.test(x.licence));
    check('deps', 'Dependencies · vulnerabilities and licences', fail ? 'fail' : badLicence.length ? 'warn' : 'pass',
      deps.length || newAdvisories.length ? `${deps.length} new package(s) · ${newAdvisories.length} new high/critical advisory(ies)` : 'No new packages or advisories',
      { details: [...newAdvisories.map((x) => `advisory: ${x}`), ...deps.map((x) => `\`${x.name}@${x.range}\` in \`${x.file}\` — ${x.licence}`)].slice(0, 30),
        fix: fail ? ['Upgrade or replace packages with high/critical advisories; do not add GPL, AGPL, SSPL or BUSL code to a closed product.'] : [] });
  }

  // 9. AI assistance: what the author declared, and what the commits say
  {
    const AI = /co-authored-by:[^\n]*(claude|anthropic|copilot|cursor|openai|chatgpt|gpt-|gemini|codeium|windsurf|devin|aider|tabnine)|generated with[^\n]*(claude|copilot|cursor|chatgpt|gemini)/i;
    let aiAdded = 0;
    const aiCommits = [];
    for (const c of commits) {
      if (!AI.test(c.body || '')) continue;
      aiCommits.push(`${c.sha.slice(0, 7)} ${c.subject}`);
      for (const line of git('show', '--numstat', '--format=', c.sha).split('\n')) {
        const n = Number(line.split('\t')[0]);
        if (Number.isFinite(n)) aiAdded += n;
      }
    }
    const detectedPct = added ? Math.min(100, Math.round((aiAdded / added) * 100)) : 0;
    let declared = null;
    if (PR_BODY_FILE && fs.existsSync(PR_BODY_FILE)) {
      const body = fs.readFileSync(PR_BODY_FILE, 'utf8');
      const m = body.match(/AI[- ]?(?:assisted|assistance|generated|written|share)?[^:\n]{0,40}:\s*(\d{1,3})\s*%/i);
      if (m) declared = Math.min(100, Number(m[1]));
      else if (/\[x\]\s*no ai/i.test(body)) declared = 0;
    }
    const missing = PR_BODY_FILE && declared === null;
    const under = declared !== null && detectedPct > declared;
    check('ai', 'AI assistance', missing ? 'fail' : under ? 'warn' : 'info',
      `${declared === null ? 'Not declared' : `Declared ${declared}%`} · commits marked as AI-assisted: ${aiCommits.length} of ${commits.length} (${detectedPct}% of added lines)`,
      {
        details: [
          ...aiCommits.map((c) => `AI-marked commit: ${c}`),
          'Only declared use and commit trailers can be counted; unmarked AI-written code cannot be detected reliably, so the declaration is required.',
        ],
        fix: missing
          ? ['Fill in "AI-assisted: N%" in the PR description (the template has the line) — 0% if none.']
          : under ? [`Commits show at least ${detectedPct}% AI-assisted lines but ${declared}% was declared — correct the declaration.`] : [],
      });
  }

  // 10. Tests travel with server changes
  {
    const serverSrc = live.filter((f) => /^server\/src\//.test(f) && !/(seed|migrations)\//.test(f));
    const testsTouched = live.some((f) => /^server\/tests\//.test(f));
    check('test-coverage', 'Tests for server changes', serverSrc.length && !testsTouched ? 'warn' : 'pass',
      serverSrc.length && !testsTouched ? `${serverSrc.length} server file(s) changed with no test added or changed` : 'Server changes come with tests (or there are none)',
      { fix: serverSrc.length && !testsTouched ? ['Add or update a test in server/tests that covers the behaviour this PR changes.'] : [] });
  }

  // 11. Size of the PR
  check('size', 'Size of the change', added > 1500 ? 'warn' : 'pass',
    `${changed.length} file(s) · +${added} / -${removed} lines · ${commits.length} commit(s)`,
    { fix: added > 1500 ? ['Split this PR — over 1,500 added lines cannot be reviewed properly in one go.'] : [] });
}

main()
  .catch((err) => check('gate', 'Gate itself', 'fail', `The gate crashed: ${err.message}`, { details: ['```', err.stack || '', '```'] }))
  .finally(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
    const rel = quality.ratingByCount(newIssues.bugs);
    const sec = quality.ratingByCount(newIssues.vulns);
    const mnt = quality.ratingBySmells(newIssues.smells, added);
    checks.unshift({ id: 'ratings', title: 'Quality on new code', status: 'info',
      summary: `Reliability ${rel} · Security ${sec} · Maintainability ${mnt} · Coverage ${coveragePct == null ? 'n/a' : `${coveragePct}%`} · Duplication ${dupPct == null ? 'n/a' : `${dupPct}%`} · Hotspots ${newIssues.hotspots}`,
      details: ['Ratings as SonarQube gives them, for the code this PR adds: A is clean; every new bug or vulnerability blocks the merge, smells are rated per 100 added lines.'], fix: [] });
    const verdict = checks.some((c) => c.status === 'fail') ? 'FAIL' : 'PASS';
    const meta = {
      verdict, base: BASE_REF, baseSha, headSha, added, removed,
      files: changed.length, commits: commits.length,
      areas: [...new Set(changed.map((c) => c.file.split('/')[0]))].sort(),
      at: new Date().toISOString(),
    };
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ...meta, checks }, null, 2));
    fs.writeFileSync(path.join(OUT, 'report.md'), renderMarkdown(meta, checks));
    fs.writeFileSync(path.join(OUT, 'report.html'), renderHtml(meta, checks));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderMarkdown(meta, checks));
    console.log(`\nCheckpoint gate: ${verdict}`);
    for (const c of checks) console.log(`  [${c.status.toUpperCase().padEnd(4)}] ${c.title} — ${c.summary}`);
    console.log(`\nReport: ${path.relative(ROOT, OUT)}/report.html`);
    process.exitCode = verdict === 'FAIL' ? 1 : 0;
  });
