/**
 * Every server source file must compile. Modules are often required lazily
 * inside a route handler, so a file that cannot parse is invisible at boot and
 * only fails when that feature is used — SOS was unreachable this way.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test.each(walk(SRC).filter((f) => f.endsWith('.js')).map((f) => [path.relative(SRC, f)]))('%s compiles', (rel) => {
  const code = fs.readFileSync(path.join(SRC, rel), 'utf8');
  expect(() => new vm.Script(`(function (exports, require, module, __filename, __dirname) {${code}\n})`, { filename: rel })).not.toThrow();
});
