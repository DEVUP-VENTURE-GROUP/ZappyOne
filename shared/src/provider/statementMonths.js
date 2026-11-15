// Monthly statements start in the launch month; the server refuses anything earlier (shop/shop-statement).
export const STATEMENTS_FROM = '2026-11';

// The latest months a statement exists for, newest first, never before launch.
export function statementMonths(n, style = 'long') {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i += 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    if (key < STATEMENTS_FROM) break;
    out.push({ key, label: m.toLocaleDateString('en-IN', { month: style, year: 'numeric' }) });
  }
  return out;
}
