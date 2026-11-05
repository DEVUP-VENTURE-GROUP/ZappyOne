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

test('a non-HTTP status on an error never crashes the reply', () => {
  const e = Object.assign(new Error('This job can no longer be passed on'), { status: 'QA_PENDING', code: 'TOO_LATE_TO_DECLINE' });
  expect(run(e).status).toBe(500);
  const ok = Object.assign(new Error('This job can no longer be passed on'), { status: 409, code: 'TOO_LATE_TO_DECLINE', jobStatus: 'QA_PENDING' });
  expect(run(ok)).toMatchObject({ status: 409, body: { error: 'This job can no longer be passed on', jobStatus: 'QA_PENDING' } });
});

test('office words become everyday ones; the code a screen checks stays the same', () => {
  const say = (msg, status = 400, code = 'X') => run(Object.assign(new Error(msg), { status, code })).body;
  expect(say('Invalid or expired OTP', 400, 'BAD_OTP')).toEqual({ error: 'That code is not right or has expired. Please try again.', code: 'BAD_OTP', requestId: 'req-1' });
  expect(say('Invalid credentials', 401).error).toBe('That did not match. Check your details and try again.');
  expect(say('Token reuse detected - please log in again', 401).error).toBe('Please sign in again.');
  expect(say('Enrolment not found', 404).error).toBe('We could not find that. It may have been removed.');
  expect(say('This enrolment has already been decided', 409).error).toBe('This application has already been checked.');
  expect(say('planCode required').error).toBe('Some details are missing. Please check and try again.');
  expect(say('Not a valid merchant outcome').error).toBe('Some details are not right. Please check them.');
  // Already plain: untouched.
  expect(say('Enter the 12-digit UPI reference from your UPI app (it is on the payment receipt).').error).toBe('Enter the 12-digit UPI reference from your UPI app (it is on the payment receipt).');
  expect(say('You do not owe ZappyOne anything right now.', 409).error).toBe('You do not owe ZappyOne anything right now.');
});
