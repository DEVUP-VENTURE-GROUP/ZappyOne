// The partner's service search (shared/src/provider/serviceSearch, same file on web and app): words in any order, case and punctuation ignored, plurals count, ticked ones never vanish.
const path = require('path');
const { execFileSync } = require('child_process');

function run(cases) {
  const file = path.join(__dirname, '../../shared/src/provider/serviceSearch.js').replace(/\\/g, '/');
  const code = `
    import { searchServices } from 'file:///${file}';
    const L = [
      { code: 'sweep', name: 'Sweeping, mopping & dusting' },
      { code: 'sofa', name: 'Sofa & carpet cleaning', description: 'Shampoo at home' },
      { code: 'bath', name: 'Bathroom refresh & balcony cleaning' },
      { code: 'ac', name: 'AC service & repair' },
      { code: 'sk', name: 'SK home cleaning service', description: null },
    ];
    console.log(JSON.stringify(${JSON.stringify(cases)}.map(([q, picked]) => searchServices(L, q, picked).map((l) => l.code))));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code]).toString());
}

test.each([
  ['words in any order', 'mop sweep', ['sweep']],
  ['capitals and spaces ignored', '  BATHROOM ', ['bath']],
  ['a plural finds the single', 'sofas', ['sofa']],
  ['the description is searched', 'shampoo', ['sofa']],
  ['a short word like AC', 'ac', ['ac']],
  ['a word in many services', 'cleaning', ['sofa', 'bath', 'sk']],
  ['punctuation typed is ignored', 'sofa & carpet!', ['sofa']],
  ['nothing matches', 'plumber', []],
  ['an empty search shows all', '', ['sweep', 'sofa', 'bath', 'ac', 'sk']],
])('%s', (_name, q, want) => {
  expect(run([[q, []]])[0]).toEqual(want);
});

test('a ticked service stays on screen whatever is typed', () => {
  expect(run([['plumber', ['bath']]])[0]).toEqual(['bath']);
});

test('a missing name or a strange search never throws', () => {
  expect(() => run([['((*', []], ['\\\\', []]])).not.toThrow();
});
