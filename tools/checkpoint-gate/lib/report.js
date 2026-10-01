/**
 * The gate's verdict as Markdown (PR comment, job summary) and as one
 * self-contained HTML page (downloadable from the run, shareable as a file).
 */

const MARK = { pass: '✅', fail: '❌', warn: '⚠️', info: 'ℹ️' };
const LABEL = { pass: 'Pass', fail: 'Fail', warn: 'Warning', info: 'Info' };

function renderMarkdown(meta, checks) {
  const fixes = checks.flatMap((c) => c.fix.map((f) => `- **${c.title}:** ${f}`));
  const out = [
    '<!-- checkpoint-gate -->',
    `## ${meta.verdict === 'PASS' ? '✅ Checkpoint gate: PASS — can be merged' : '❌ Checkpoint gate: FAIL — cannot be merged yet'}`,
    '',
    `\`${meta.baseSha.slice(0, 7)}\` (${meta.base}) → \`${meta.headSha.slice(0, 7)}\` · ${meta.files} files · +${meta.added} / -${meta.removed} · ${meta.commits} commits · ${meta.areas.join(', ') || '—'}`,
    '',
    '| | Check | Result |',
    '|---|---|---|',
    ...checks.map((c) => `| ${MARK[c.status]} | ${c.title} | ${c.summary.replace(/\|/g, '\\|')} |`),
    '',
  ];
  if (fixes.length) out.push('### What to fix', '', ...fixes, '');
  for (const c of checks.filter((x) => x.details.length)) {
    out.push(`<details${c.status === 'fail' ? ' open' : ''}><summary>${MARK[c.status]} ${c.title}</summary>`, '');
    let inCode = false;
    for (const d of c.details) {
      if (d.startsWith('```')) { inCode = !inCode; out.push(d); continue; }
      out.push(inCode ? d : `- ${d}`);
    }
    out.push('', '</details>', '');
  }
  out.push(`<sub>Verify-only: this gate never changes code. Generated ${meta.at}.</sub>`, '');
  return out.join('\n');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

function detailsHtml(details) {
  const parts = [];
  let code = null;
  let list = [];
  const flush = () => { if (list.length) { parts.push(`<ul>${list.join('')}</ul>`); list = []; } };
  for (const d of details) {
    if (d.startsWith('```')) {
      if (code === null) { flush(); code = []; } else { parts.push(`<pre>${esc(code.join('\n'))}</pre>`); code = null; }
      continue;
    }
    if (code !== null) code.push(d);
    else list.push(`<li>${inline(d)}</li>`);
  }
  flush();
  return parts.join('');
}

function renderHtml(meta, checks) {
  const fixes = checks.flatMap((c) => c.fix.map((f) => ({ title: c.title, f })));
  const pass = meta.verdict === 'PASS';
  const counts = ['fail', 'warn', 'pass', 'info'].map((s) => [s, checks.filter((c) => c.status === s).length]).filter(([, n]) => n);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Checkpoint Gate Report</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#14181f;--muted:#5d6675;--line:#e3e6eb;--code:#eef0f4;
--pass:#13795b;--pass-bg:#e5f5ee;--fail:#b42318;--fail-bg:#fdecea;--warn:#9a6700;--warn-bg:#fff4d6;--info:#3b5bdb;--info-bg:#eaf0ff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1218;--card:#171b23;--ink:#e7eaf0;--muted:#98a2b3;--line:#2a303b;--code:#222833;
--pass:#4cc38a;--pass-bg:#11291f;--fail:#f97066;--fail-bg:#33150f;--warn:#f5b83d;--warn-bg:#2e2410;--info:#8da2fb;--info-bg:#1a2140}}
:root[data-theme="dark"]{--bg:#0f1218;--card:#171b23;--ink:#e7eaf0;--muted:#98a2b3;--line:#2a303b;--code:#222833;
--pass:#4cc38a;--pass-bg:#11291f;--fail:#f97066;--fail-bg:#33150f;--warn:#f5b83d;--warn-bg:#2e2410;--info:#8da2fb;--info-bg:#1a2140}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 16px 64px;display:grid;gap:20px}
h1{font-size:24px;margin:0;text-wrap:balance}
h2{font-size:15px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.verdict{border-radius:14px;padding:20px 22px;display:grid;gap:6px;border:1px solid var(--line);background:var(--card)}
.verdict.pass{border-left:6px solid var(--pass)}.verdict.fail{border-left:6px solid var(--fail)}
.big{font-size:28px;font-weight:700}.verdict.pass .big{color:var(--pass)}.verdict.fail .big{color:var(--fail)}
.meta{color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px}
.pass-c{color:var(--pass);background:var(--pass-bg)}.fail-c{color:var(--fail);background:var(--fail-bg)}
.warn-c{color:var(--warn);background:var(--warn-bg)}.info-c{color:var(--info);background:var(--info-bg)}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.table{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:14px}
td{padding:10px 8px;border-top:1px solid var(--line);vertical-align:top}
tr:first-child td{border-top:0}
td.s{width:92px}
.fix li{margin:6px 0}
details{border-top:1px solid var(--line);padding:10px 0}
details:first-of-type{border-top:0}
summary{cursor:pointer;font-weight:600}
summary:focus-visible{outline:2px solid var(--info);outline-offset:3px;border-radius:4px}
code{background:var(--code);padding:1px 5px;border-radius:5px;font:12.5px ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}
pre{background:var(--code);padding:12px;border-radius:8px;overflow-x:auto;font:12px/1.5 ui-monospace,Consolas,monospace}
ul{margin:8px 0;padding-left:20px}
footer{color:var(--muted);font-size:12px;text-align:center}
</style>
</head>
<body>
<main>
<div class="verdict ${pass ? 'pass' : 'fail'}">
  <h1>Checkpoint gate</h1>
  <div class="big">${pass ? 'PASS — can be merged' : 'FAIL — cannot be merged yet'}</div>
  <div class="meta">${esc(meta.base)} <code>${meta.baseSha.slice(0, 7)}</code> → <code>${meta.headSha.slice(0, 7)}</code> · ${meta.files} files · +${meta.added} / −${meta.removed} lines · ${meta.commits} commits · ${esc(meta.areas.join(', ') || '—')}</div>
  <div class="chips">${counts.map(([s, n]) => `<span class="chip ${s}-c">${n} ${LABEL[s].toLowerCase()}</span>`).join('')}</div>
</div>
${fixes.length ? `<section><h2>What to fix</h2><ul class="fix">${fixes.map((x) => `<li><strong>${esc(x.title)}:</strong> ${inline(x.f)}</li>`).join('')}</ul></section>` : ''}
<section><h2>Checks</h2><div class="table"><table>
${checks.map((c) => `<tr><td class="s"><span class="chip ${c.status}-c">${LABEL[c.status]}</span></td><td><strong>${esc(c.title)}</strong><br><span class="meta">${inline(c.summary)}</span></td></tr>`).join('\n')}
</table></div></section>
${checks.some((c) => c.details.length) ? `<section><h2>Details</h2>${checks.filter((c) => c.details.length).map((c) => `<details${c.status === 'fail' ? ' open' : ''}><summary>${esc(c.title)}</summary>${detailsHtml(c.details)}</details>`).join('')}</section>` : ''}
<footer>Verify-only: this gate never changes code · generated ${esc(meta.at)}</footer>
</main>
</body>
</html>
`;
}

module.exports = { renderMarkdown, renderHtml };
