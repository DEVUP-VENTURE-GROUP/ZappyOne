/**
 * What people see when something fails: our own messages pass through; an
 * unexpected failure never shows internals, only a calm sentence and the
 * request id support can trace; database mistakes read as plain requests.
 */
const { errorHandler } = require('../src/middlewares/error');

function run(err) {
  const out = {};
  const res = { status(s) { out.status = s; return this; }, json(b) { out.body = b; return this; } };
  errorHandler(err, { id: 'req-1', path: '/x' }, res, () => {});
  return out;
}

test('an error we raise on purpose keeps its message and fields', () => {
  const e = Object.assign(new Error('This slot is not available'), { status: 409, code: 'SLOT_TAKEN', activeOrderId: 'abc' });
  expect(run(e)).toEqual({ status: 409, body: { error: 'This slot is not available', code: 'SLOT_TAKEN', requestId: 'req-1', activeOrderId: 'abc' } });
});

test('an unexpected crash shows a calm sentence, never internals', () => {
  const e = new TypeError("Cannot read properties of undefined (reading 'priceSnapshot')");
  e.secretThing = 'mongodb://inside';
  const { status, body } = run(e);
  expect(status).toBe(500);
  expect(body).toEqual({ error: 'That did not go through. Please try again in a moment.', code: 'INTERNAL', requestId: 'req-1' });
});

test('database mistakes become plain requests', () => {
  expect(run(Object.assign(new Error('Cast to ObjectId failed'), { name: 'CastError' }))).toMatchObject({ status: 400, body: { code: 'BAD_ID' } });
  expect(run(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }))).toMatchObject({ status: 409, body: { error: 'This already exists.' } });
});
