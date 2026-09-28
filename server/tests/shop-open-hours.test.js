/**
 * A shop's opening hours are IST, and the server is not.
 *
 * Reported from production as "the shop closes itself when I refresh". Nothing
 * was closing it: `withOpenState` compared IST opening hours against
 * `new Date().getHours()`, which on a UTC server is India's clock minus 5h30m.
 * A shop trading 09:00–21:00 was therefore treated as open 09:00–21:00 UTC —
 * 14:30 to 02:30 in Hyderabad. It showed shut through every morning and open
 * through the small hours, and the day-of-week rolled over at 05:30 IST too, so
 * Monday's hours were applied to Sunday night.
 *
 * These tests pin the server's clock to real UTC instants and assert what a
 * shop in India should see, which is the only thing that makes the bug visible:
 * on a machine set to IST the old code passed.
 */

const { istParts, istDayStart, istWeekStart } = require('../src/core/time/ist');

// `withOpenState` is not exported, so it is exercised through the public
// profile path in the service — the same way a customer reaches it.
const shopService = require('../src/modules/shop/shop.service');

jest.setTimeout(20000);

/** Freeze the process clock at a real UTC instant. */
function atUtc(iso, fn) {
  jest.useFakeTimers().setSystemTime(new Date(iso));
  try { return fn(); } finally { jest.useRealTimers(); }
}

describe('IST wall clock', () => {
  it('reads 10:00 IST when the server clock says 04:30 UTC', () => {
    atUtc('2026-09-14T04:30:00Z', () => {
      const p = istParts();
      expect(p.hours).toBe(10);
      expect(p.minutes).toBe(0);
      expect(p.minutesOfDay).toBe(600);
    });
  });

  it('is still Monday in India at 23:30 IST, when UTC has not rolled over', () => {
    // 18:00 UTC Monday = 23:30 IST Monday. Same day both ways.
    atUtc('2026-09-14T18:00:00Z', () => expect(istParts().day).toBe(1));
  });

  it('is already Tuesday in India at 00:30 IST, while UTC is still Monday', () => {
    // 19:00 UTC Monday = 00:30 IST Tuesday. THIS is what rolled the day wrong.
    atUtc('2026-09-14T19:00:00Z', () => {
      expect(istParts().day).toBe(2);
      expect(istParts().hours).toBe(0);
    });
  });

  it('starts the day at 18:30 UTC the previous evening', () => {
    atUtc('2026-09-14T04:30:00Z', () => {
      expect(istDayStart().toISOString()).toBe('2026-09-13T18:30:00.000Z');
    });
  });

  it('starts the week on Monday, not Sunday', () => {
    // Wednesday 17 Sep 2026 → the week began Monday 15 Sep, 00:00 IST.
    atUtc('2026-09-16T12:00:00Z', () => {
      expect(istWeekStart().toISOString()).toBe('2026-09-13T18:30:00.000Z');
    });
  });
});

describe('a shop trading 09:00–21:00 IST', () => {
  /** Monday–Sunday, 09:00 to 21:00. */
  const hours = Array.from({ length: 7 }, (_, day) => ({
    day, opensAt: '09:00', closesAt: '21:00', isClosed: false,
  }));

  const openAt = (iso) => atUtc(iso, () => shopService.__withOpenState({ hours }).openNow);

  it('is OPEN at 10:00 IST — the case the bug got wrong', () => {
    // 04:30 UTC. The old code read hour 4 and called the shop closed.
    expect(openAt('2026-09-14T04:30:00Z')).toBe(true);
  });

  it('is open at 09:01 and closed at 08:59 IST', () => {
    expect(openAt('2026-09-14T03:31:00Z')).toBe(true);   // 09:01 IST
    expect(openAt('2026-09-14T03:29:00Z')).toBe(false);  // 08:59 IST
  });

  it('is closed at 22:00 IST, not open until 02:30', () => {
    // 16:30 UTC = 22:00 IST. The old code read hour 16 and kept it open.
    expect(openAt('2026-09-14T16:30:00Z')).toBe(false);
  });

  it('is closed at 01:00 IST', () => {
    expect(openAt('2026-09-14T19:30:00Z')).toBe(false);
  });
});

describe('a shop that closes overnight at 22:00–06:00 IST', () => {
  const hours = Array.from({ length: 7 }, (_, day) => ({
    day, opensAt: '22:00', closesAt: '06:00', isClosed: false,
  }));
  const openAt = (iso) => atUtc(iso, () => shopService.__withOpenState({ hours }).openNow);

  it('is open at 23:00 IST and at 02:00 IST', () => {
    expect(openAt('2026-09-14T17:30:00Z')).toBe(true);   // 23:00 IST
    expect(openAt('2026-09-14T20:30:00Z')).toBe(true);   // 02:00 IST
  });

  it('is closed at 12:00 IST', () => {
    expect(openAt('2026-09-14T06:30:00Z')).toBe(false);
  });
});

describe('shops without usable hours', () => {
  it('reports unknown rather than closed when no hours are set', () => {
    // `false` would hide a shop that simply has not filled the form in.
    expect(shopService.__withOpenState({ hours: [] }).openNow).toBeNull();
  });

  it('is closed on a day marked closed', () => {
    const hours = [{ day: 1, opensAt: '09:00', closesAt: '21:00', isClosed: true }];
    atUtc('2026-09-14T04:30:00Z', () => {
      expect(shopService.__withOpenState({ hours }).openNow).toBe(false);
    });
  });
});
