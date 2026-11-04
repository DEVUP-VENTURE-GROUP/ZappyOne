// Limits count each signed-in person on their own: customers behind one Jio/Airtel address were refused "Too many requests" for others' taps.
const { limitKey } = require('../src/middlewares/rateLimit');

test('signed in: counted per person, whatever address they share', () => {
  expect(limitKey({ ip: '49.36.1.1', auth: { sub: 'a1' } })).toBe('u:a1');
  expect(limitKey({ ip: '49.36.1.1', auth: { sub: 'b2' } })).toBe('u:b2');
});

test('signed out (login, OTP, public pages): still counted per address', () => {
  expect(limitKey({ ip: '49.36.1.1' })).toBe('49.36.1.1');
  expect(limitKey({ ip: '49.36.1.1', auth: null })).toBe('49.36.1.1');
});
