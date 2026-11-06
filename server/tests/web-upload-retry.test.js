// Websites send photos like the app does: a fresh link each try, 3 tries, a hung line given up on.
const path = require('path');
const { execFileSync } = require('child_process');

jest.setTimeout(60000);

function run(script) {
  const file = path.join(__dirname, '../../shared/src/utils/sendSigned.js').replace(/\\/g, '/');
  const code = `import { sendSigned } from 'file:///${file}';\nconst log = [];\n${script}`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code]).toString());
}

const signer = `let n = 0; const getSigned = async () => { n += 1; log.push('sign' + n); return { uploadUrl: 'u' + n, key: 'k' + n }; };`;

test('a failed try gets a fresh link and the second try succeeds', () => {
  const out = run(`${signer}
    globalThis.fetch = async (url) => { log.push('put ' + url); return { ok: url === 'u2', status: url === 'u2' ? 200 : 503 }; };
    const s = await sendSigned(getSigned, 'x', 'image/jpeg');
    console.log(JSON.stringify({ key: s.key, log }));`);
  expect(out).toEqual({ key: 'k2', log: ['sign1', 'put u1', 'sign2', 'put u2'] });
});

test('a dropped connection is retried, and after 3 tries the person is told', () => {
  const out = run(`${signer}
    globalThis.fetch = async () => { log.push('put'); throw new TypeError('Failed to fetch'); };
    try { await sendSigned(getSigned, 'x', 'image/jpeg'); console.log('{}'); } catch (e) { console.log(JSON.stringify({ err: e.message, puts: log.filter((l) => l === 'put').length })); }`);
  expect(out).toEqual({ err: 'Failed to fetch', puts: 3 });
});

test('a line that never answers is cut off instead of spinning forever', () => {
  const out = run(`${signer}
    globalThis.fetch = (url, opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    const t0 = Date.now();
    try { await sendSigned(getSigned, 'x', 'image/jpeg', { tries: 1, timeoutMs: 200 }); } catch (e) { console.log(JSON.stringify({ err: e.message, fast: Date.now() - t0 < 2000 })); }`);
  expect(out).toEqual({ err: 'aborted', fast: true });
});

test('the content type the link was made for is the one sent', () => {
  const out = run(`${signer}
    globalThis.fetch = async (url, opts) => { log.push(opts.method + ' ' + opts.headers['Content-Type']); return { ok: true, status: 200 }; };
    await sendSigned(getSigned, 'x', 'image/png');
    console.log(JSON.stringify(log));`);
  expect(out).toEqual(['sign1', 'PUT image/png']);
});
