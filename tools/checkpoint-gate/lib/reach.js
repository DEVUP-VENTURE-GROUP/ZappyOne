/**
 * What is actually used, for one checkout of the repo.
 *
 *   unreachableWeb(root)     front-end files no app entry (main.jsx) imports
 *   unreachableServer(root)  server files nothing runnable requires
 *   unusedApiHooks(root)     RTK Query hooks api.js exports that no screen uses
 *   missingApiHooks(root)    hooks a screen imports that api.js does not define —
 *                            a build bundles these as undefined and the screen
 *                            crashes only when it opens ("useX is not a function")
 *
 * The gate runs these on the PR and on its base and fails on anything NEW,
 * so old debt is reported but never blamed on the PR that didn't add it.
 */
const fs = require('fs');
const path = require('path');

const WEB_APPS = ['client', 'servicepro', 'rakshak', 'admin', 'events'];
const CODE = /\.(jsx?|tsx?|mjs|cjs)$/;

function listFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) listFiles(p, out);
    else out.push(path.normalize(p));
  }
  return out;
}

function resolver(exts) {
  return (base) => {
    for (const e of exts) {
      const f = base + e;
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return path.normalize(f);
    }
    return null;
  };
}

const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');

/* Front end */

const WEB_IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function unreachableWeb(root) {
  const resolve = resolver(['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx']);
  const alias = (spec, from) => {
    if (spec.startsWith('@shared/')) return path.join(root, 'shared/src', spec.slice(8));
    if (spec.startsWith('@assets/')) return path.join(root, 'assets', spec.slice(8));
    if (spec.startsWith('@/')) return path.join(root, 'admin/src', spec.slice(2));
    if (spec.startsWith('.')) return path.resolve(path.dirname(from), spec);
    return null;
  };
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!CODE.test(file)) return;
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(WEB_IMPORT)) {
      const target = alias(m[1] || m[2] || m[3] || m[4], file);
      const hit = target && resolve(target);
      if (hit) walk(hit);
    }
  };
  for (const app of WEB_APPS) {
    const entry = resolve(path.join(root, app, 'src', 'main'));
    if (entry) walk(entry);
  }
  const all = [...WEB_APPS.map((a) => path.join(root, a, 'src')), path.join(root, 'shared/src')]
    .flatMap((d) => listFiles(d))
    .filter((f) => CODE.test(f) && !/\.test\./.test(f));
  return all.filter((f) => !seen.has(f)).map((f) => rel(root, f));
}

/* Server */

const REQUIRE = /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

/** Files the server runs on their own: the app, workers, seeds, migrations, scripts, tests. */
function serverEntries(root) {
  const server = path.join(root, 'server');
  const src = listFiles(path.join(server, 'src')).filter((f) => f.endsWith('.js'));
  return [
    path.join(server, 'src/server.js'),
    ...src.filter((f) => /[\\/]jobs[\\/][^\\/]+\.worker\.js$/.test(f)),
    ...src.filter((f) => /[\\/](seed|migrations)[\\/]/.test(f) || /[\\/]run-[^\\/]+\.js$/.test(f)),
    ...listFiles(path.join(server, 'scripts')).filter((f) => f.endsWith('.js')),
    ...listFiles(path.join(server, 'tests')).filter((f) => f.endsWith('.js')),
  ].map((f) => path.normalize(f));
}

function unreachableServer(root) {
  const resolve = resolver(['', '.js', '.json', '/index.js']);
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!file.endsWith('.js')) return;
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(REQUIRE)) {
      if (!m[1].startsWith('.')) continue;
      const hit = resolve(path.resolve(path.dirname(file), m[1]));
      if (hit) walk(hit);
    }
  };
  serverEntries(root).filter((f) => fs.existsSync(f)).forEach(walk);
  return listFiles(path.join(root, 'server/src'))
    .filter((f) => f.endsWith('.js') && !seen.has(f))
    .map((f) => rel(root, f));
}

/* API hooks */

function unusedApiHooks(root) {
  const apiFile = path.join(root, 'shared/src/services/api.js');
  if (!fs.existsSync(apiFile)) return [];
  const api = fs.readFileSync(apiFile, 'utf8');
  const exportBlock = api.slice(api.indexOf('export const {'));
  const hooks = new Set(exportBlock.match(/\buse[A-Z]\w+/g) || []);
  const others = [...WEB_APPS.map((a) => path.join(root, a, 'src')), path.join(root, 'shared/src')]
    .flatMap((d) => listFiles(d))
    .filter((f) => CODE.test(f) && path.normalize(f) !== path.normalize(apiFile));
  const used = new Set();
  for (const f of others) for (const id of fs.readFileSync(f, 'utf8').match(/[A-Za-z_$][\w$]*/g) || []) used.add(id);
  return [...hooks].filter((h) => !used.has(h)).sort();
}

function missingApiHooks(root) {
  const apiFile = path.join(root, 'shared/src/services/api.js');
  if (!fs.existsSync(apiFile)) return [];
  const api = fs.readFileSync(apiFile, 'utf8');
  const exported = new Set(api.slice(api.indexOf('export const {')).match(/use[A-Z][A-Za-z0-9_]+/g) || []);
  const endpoints = new Set([...api.matchAll(/^ +([A-Za-z0-9_]+): b[.](query|mutation)[(]/gm)].map((m) => m[1]));
  const endpointOf = (hook) => {
    const m = hook.match(/^use(?:Lazy)?(\w+?)(?:Query|Mutation)$/);
    return m ? m[1][0].toLowerCase() + m[1].slice(1) : null;
  };
  const missing = [];
  const files = [...WEB_APPS.map((a) => path.join(root, a, 'src')), path.join(root, 'shared/src')]
    .flatMap((d) => listFiles(d)).filter((f) => CODE.test(f) && path.normalize(f) !== path.normalize(apiFile));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*services\/api['"]/g)) {
      for (const name of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter((x) => x.startsWith('use'))) {
        if (!exported.has(name) || !endpoints.has(endpointOf(name))) missing.push(`${name} ← ${rel(root, f)}`);
      }
    }
  }
  return missing.sort();
}

module.exports = { unreachableWeb, unreachableServer, unusedApiHooks, missingApiHooks, WEB_APPS };
