// Building blocks for the category catalogs: the usual option sets and a job written on one line (a plain number is the price of a one-option service).
const HOME = [{ code: '1bhk', name: '1 BHK' }, { code: '2bhk', name: '2 BHK' }, { code: '3bhk', name: '3 BHK' }, { code: '4bhk', name: '4 BHK or villa' }];
const ONE = [{ code: 'one', name: 'Standard' }];
const at = (a, b, c, d) => ({ '1bhk': a, '2bhk': b, '3bhk': c, '4bhk': d });
const one = (p) => ({ one: p });
const job = (code, name, minutes, prices, includes) => ({ code, name, minutes, prices: typeof prices === 'number' ? one(prices) : prices, includes: includes.split('|') });

module.exports = { HOME, ONE, at, one, job };
