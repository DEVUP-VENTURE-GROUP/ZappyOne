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
const SCANNED = /^(client|servicepro|rakshak|admin|events|shared|server)\//;

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
function check(id, title, status, summary, { details = [], fix = [] } = {}) {
  checks.push({ id, title, status, summary, details, fix });
}

/* What changed */

const baseSha = git('merge-base', BASE_REF, 'HEAD');
const headSha = git('rev-parse', 'HEAD');

const changed = git('diff', '--name-status', '-M', baseSha, 'HEAD').split('\n').filter(Boolean).map((line) => {
  const parts = line.split('\t');
  return { status: parts[0][0], file: parts[parts.length - 1] };
});
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
git('worktree', 'add', '--detach', '--force', baseDir, baseSha);

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

  // 3. Server tests
  if (flag('skip-tests')) {
    check('tests', 'Server tests', 'info', 'Skipped (--skip-tests)');
  } else {
    const res = run('npm', ['test', '--', '--silent'], path.join(ROOT, 'server'));
    const out = `${res.stdout}\n${res.stderr}`;
    const summary = (out.match(/^Tests:.*$/m) || ['Tests: no summary'])[0];
    const failed = [...out.matchAll(/^\s*● (.+)$/gm)].map((m) => m[1]).filter((t) => !/Validation Warning/.test(t));
    check('tests', 'Server tests', res.status === 0 ? 'pass' : 'fail', summary.replace(/^Tests:\s*/, ''), {
      details: res.status === 0 ? [] : [...new Set(failed)].slice(0, 30).map((t) => `✗ ${t}`).concat(failed.length ? [] : ['```', lastLines(out), '```']),
      fix: res.status === 0 ? [] : ['Make every server test pass (`cd server && npm test`).'],
    });
  }

  // 4. Builds, and how much each app ships (gzip)
  if (flag('skip-build')) {
    check('build', 'Build every app', 'info', 'Skipped (--skip-build)');
  } else {
    const budgets = JSON.parse(fs.readFileSync(path.join(__dirname, 'budgets.json'), 'utf8'));
    const rows = [];
    const fix = [];
    let worst = 'pass';
    for (const app of WEB_APPS) {
      const dir = path.join(ROOT, app);
      const res = run('npx', ['vite', 'build', '--logLevel', 'error'], dir);
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
          const p = path.join(d, n);
          if (fs.statSync(p).isDirectory()) walk(p);
          else if (/\.(js|css)$/.test(n)) { const b = fs.readFileSync(p); raw += b.length; gz += zlib.gzipSync(b, { level: 9 }).length; }
        }
      };
      walk(path.join(dir, 'dist'));
      const budget = budgets[app];
      const over = budget && kb(gz) > budget;
      if (over) { worst = 'fail'; fix.push(`${app} ships ${kb(gz)} KB gzipped, over its ${budget} KB budget — lazy-load the new code or drop a dependency. Raise the budget in tools/checkpoint-gate/budgets.json only with a reason in the PR.`); }
      rows.push(`${over ? '✗' : '✓'} **${app}** — ${kb(raw)} KB raw · **${kb(gz)} KB gzipped**${budget ? ` (budget ${budget} KB)` : ''}`);
    }
    check('build', 'Build every app · compressed size', worst,
      worst === 'pass' ? `All ${WEB_APPS.length} apps build and stay within their gzip budgets` : 'A build failed or an app grew past its budget',
      { details: rows, fix });
  }

  // 5. Code health: complexity, depth, size, dead values — NEW violations only
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
    const [head, base] = await Promise.all([lintAt(ROOT, codeFiles), lintAt(baseDir, codeFiles)]);
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
    const debt = head.length - fresh.length;
    check('health', 'Code health (new issues)', fresh.length ? 'fail' : 'pass',
      fresh.length
        ? `${fresh.length} new issue(s) in ${new Set(fresh.map((f) => f.file)).size} file(s)`
        : `No new issues${debt ? ` · ${debt} older issue(s) remain in touched files` : ''}`,
      {
        details: fresh.map((v) => `\`${v.file}:${v.line}\` **${v.rule}** — ${v.message}`),
        fix: fresh.length ? ['Split long or branchy functions, flatten deep nesting, pass an object instead of many parameters, and delete values that are never used.'] : [],
      });
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
    try { git('worktree', 'remove', '--force', baseDir); } catch { fs.rmSync(baseDir, { recursive: true, force: true }); }
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
