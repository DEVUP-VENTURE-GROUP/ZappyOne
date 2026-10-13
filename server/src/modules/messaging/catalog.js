/**
 * Every automatic message ZappyOne sends, in one place.
 *
 * An entry says who it is for, which channels it uses, whether it is urgent
 * (urgent pushes ignore quiet hours), whether it is promotional (respects the
 * "no offers" setting and carries an unsubscribe link), and builds the words
 * from the facts it is given. Push is short; email carries the details.
 *
 *   key: { audience, type, channels: ['push','email'], urgent, promotional,
 *          sample: () => ctx, build: (ctx) => ({ push, email }) }
 *
 * `type` is the in-app notification type (notification.model TYPES).
 * `sample` feeds the admin preview, so every template can be seen before it
 * is ever sent.
 */
const { rupees } = require('./facts');

const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';
const noun = (kind) => ({ repair: 'technician', pet: 'pet pro', helping: 'helper' }[kind] || 'provider');
const prov = (f) => f.provider?.name || `your ${noun(f.kind)}`;

const SAMPLE_JOB = {
  kind: 'repair', id: 'sample', reference: 'RP7K2Q9M', service: 'Display assembly replacement',
  at: 'Sat, 11 Oct, 4:30 pm', bookedAt: 'Fri, 10 Oct, 6:12 pm', address: 'Flat 302, Cyber Residency, Madhapur, Hyderabad',
  provider: { name: 'Ravi Kumar', rating: 4.8 },
  lines: [['Service', '₹2,450'], ['Platform fee', '₹10'], ['Taxes', '₹0']], totalPaise: 246000, total: '₹2,460',
  paid: false, method: 'Cash', link: '/repair/bookings/sample', providerLink: '/worker/repair/sample',
};
const sampleJob = (over = {}) => ({ f: { ...SAMPLE_JOB, ...over }, name: 'Aarav' });

/** Rows every booking email shows. */
const bookingRows = (f) => [
  ['Booking', f.reference], ['Service', f.service], ['When', f.at || 'As soon as possible'], ['Where', f.address],
  ...(f.provider ? [[noun(f.kind)[0].toUpperCase() + noun(f.kind).slice(1), f.provider.name]] : []),
];

const CATALOG = {
  /* ---------------- Customer: booking lifecycle ---------------- */
  'booking.confirmed': {
    audience: 'customer', type: 'order_placed', channels: ['push', 'email'], label: 'Booking confirmed',
    sample: () => sampleJob({ provider: null }),
    build: ({ f, name, s, url }) => ({
      push: { title: 'Booking confirmed', body: `${f.service}. We are finding the best ${noun(f.kind)} near you.`, link: f.link },
      email: {
        subject: `Booking confirmed · ${f.service} · ${f.reference}`,
        preheader: `We are finding the best ${noun(f.kind)} near you.`,
        heading: 'Your booking is confirmed',
        intro: [`Hi ${first(name)}, thanks for booking with ${s.brandName}. We are finding the best ${noun(f.kind)} near you and will let you know the moment someone accepts.`],
        rows: bookingRows(f), items: f.lines, total: ['Total', f.total],
        button: { label: 'Track your booking', url: url(f.link) },
        note: f.method === 'Cash' ? 'Pay in cash once the job is done. No charge until then.' : '',
      },
    }),
  },
  'booking.accepted': {
    audience: 'customer', type: 'worker_assigned', channels: ['push'], urgent: true, label: 'Provider accepted',
    sample: () => sampleJob(),
    build: ({ f }) => ({
      push: { title: `${prov(f)} is on your booking`, body: `${f.service}${f.provider?.rating ? ` · ★ ${f.provider.rating.toFixed(1)}` : ''}. You can call or chat from the app.`, link: f.link },
    }),
  },
  'booking.on_the_way': {
    audience: 'customer', type: 'worker_on_the_way', channels: ['push'], urgent: true, label: 'Provider on the way',
    sample: () => sampleJob(),
    build: ({ f }) => ({ push: { title: `${prov(f)} is on the way`, body: 'Follow them live in the app.', link: f.link } }),
  },
  'booking.arrived': {
    audience: 'customer', type: 'worker_arrived', channels: ['push'], urgent: true, label: 'Provider arrived',
    sample: () => sampleJob(),
    build: ({ f }) => ({ push: { title: `${prov(f)} has arrived`, body: 'Share your start code from the app when you meet.', link: f.link } }),
  },
  'booking.progress': {
    audience: 'customer', type: 'trip_started', channels: ['push'], label: 'Job progress (pickup, workshop, quality checks…)',
    sample: () => ({ ...sampleJob(), title: 'Device at the workshop', body: 'Your device has reached the workshop.' }),
    build: ({ f, title, body }) => ({ push: { title, body, link: f.link } }),
  },
  'quote.ready': {
    audience: 'customer', type: 'order_delayed', channels: ['push', 'email'], urgent: true, label: 'Quote needs approval',
    sample: () => ({ ...sampleJob(), quote: { summary: 'The display panel and digitizer are both cracked; the frame is fine.', lines: [['Booked repair (already agreed)', '₹2,450'], ['+ Back glass', '₹900']], total: '₹3,360', revision: 1 } }),
    build: ({ f, name, quote, url }) => ({
      push: { title: quote.revision > 1 ? 'Updated quote needs your approval' : 'Your quote is ready', body: `${quote.total} for ${f.service}. Work starts only when you approve.`, link: f.link },
      email: {
        subject: `Quote for your ${f.service} · ${quote.total} · ${f.reference}`,
        preheader: 'Work starts only when you approve it.',
        heading: quote.revision > 1 ? 'An updated quote needs your approval' : 'Your quote is ready',
        intro: [`Hi ${first(name)}, ${prov(f)} has checked your booking.`, quote.summary ? `What they found: ${quote.summary}` : null].filter(Boolean),
        rows: [['Booking', f.reference], ['Service', f.service]], items: quote.lines, total: ['New total', quote.total],
        button: { label: 'Review and approve', url: url(f.link) },
        note: 'Nothing is done or charged until you approve. You can ask a question or decline from the same screen.',
      },
    }),
  },
  'booking.provider_changed': {
    audience: 'customer', type: 'order_reassigned', channels: ['push'], urgent: true, label: 'Provider could not make it',
    sample: () => sampleJob(),
    build: ({ f }) => ({ push: { title: 'Finding you someone else', body: `Your ${noun(f.kind)} could not make it. We are finding the next one now; you can also cancel free.`, link: f.link } }),
  },
  'booking.slow': {
    audience: 'customer', type: 'order_delayed', channels: ['push'], label: 'Still finding someone (10 min)',
    sample: () => ({ ...sampleJob({ provider: null }), boostable: true }),
    build: ({ f, boostable }) => ({
      push: {
        title: 'Still finding someone for you',
        body: boostable ? 'It is taking longer than usual. Adding a little for the provider often helps; you can also wait.' : 'It is taking longer than usual. We will tell you the moment someone accepts.',
        link: f.link,
      },
    }),
  },
  'booking.completed': {
    audience: 'customer', type: 'order_completed', channels: ['push', 'email'], label: 'Job done + receipt',
    sample: () => sampleJob({ paid: true }),
    build: ({ f, name, s, url }) => ({
      push: { title: 'All done', body: `${f.service} is complete. Your receipt is in your email and the app.`, link: f.link },
      email: {
        subject: `Receipt · ${f.service} · ${f.reference}`,
        preheader: `${f.total} · thank you for choosing ${s.brandName}.`,
        heading: 'Your job is done',
        intro: [`Hi ${first(name)}, ${prov(f)} has finished your ${f.service.toLowerCase()}. Your receipt is attached.`],
        rows: [...bookingRows(f), ['Paid by', f.method]], items: f.lines, total: [f.paid ? 'Total paid' : 'Total', f.total],
        button: { label: 'Rate your experience', url: url(f.link) },
        note: 'Something not right? Reply from the booking in the app within 7 days and we will make it right.',
      },
    }),
  },
  'booking.cancelled': {
    audience: 'customer', type: 'order_cancelled', channels: ['push', 'email'], urgent: true, label: 'Booking cancelled',
    sample: () => ({ ...sampleJob(), by: 'you', feePaise: 3000, refundPaise: 0, reason: 'No longer needed' }),
    build: ({ f, name, by, feePaise = 0, refundPaise = 0, reason, url }) => {
      const money = feePaise > 0
        ? (refundPaise > 0 ? `A ${rupees(feePaise)} cancellation fee applied; ${rupees(refundPaise)} is being refunded.` : `A ${rupees(feePaise)} cancellation fee applies.`)
        : refundPaise > 0 ? `${rupees(refundPaise)} is being refunded to you.` : 'No charge.';
      const who = by === 'you' ? 'You cancelled this booking.' : by === 'provider' ? 'Your provider cancelled and we could not find a replacement.' : `${'ZappyOne'} cancelled this booking${reason ? `: ${reason}` : '.'}`;
      return {
        push: { title: 'Booking cancelled', body: `${f.service}. ${money}`, link: f.link },
        email: {
          subject: `Booking cancelled · ${f.reference}`,
          preheader: money,
          heading: 'Your booking is cancelled',
          intro: [`Hi ${first(name)}, ${who}`, money],
          rows: [['Booking', f.reference], ['Service', f.service], ['When', f.at], ...(reason && by === 'you' ? [['Reason', reason]] : [])],
          button: { label: 'Book again', url: url('/services') },
          note: refundPaise > 0 ? 'Refunds reach your account in 5 to 7 working days, depending on your bank.' : '',
        },
      };
    },
  },
  'payment.refunded': {
    audience: 'customer', type: 'refund_processed', channels: ['push', 'email'], label: 'Refund sent',
    sample: () => ({ ...sampleJob(), refundPaise: 246000 }),
    build: ({ f, name, refundPaise, url }) => ({
      push: { title: `${rupees(refundPaise)} refund on its way`, body: `For ${f.service} (${f.reference}). It reaches your account in 5 to 7 working days.`, link: f.link },
      email: {
        subject: `Refund of ${rupees(refundPaise)} · ${f.reference}`, preheader: 'It reaches your account in 5 to 7 working days.',
        heading: 'Your refund is on its way',
        intro: [`Hi ${first(name)}, we have sent ${rupees(refundPaise)} back for ${f.service}. Depending on your bank, it shows up in 5 to 7 working days.`],
        rows: [['Booking', f.reference], ['Refund', rupees(refundPaise)]],
        button: { label: 'View booking', url: url(f.link) },
      },
    }),
  },
  'customer.finish_booking': {
    audience: 'customer', type: 'booking_unfinished', channels: ['push'], label: 'Unfinished booking (30 min later, once)',
    sample: () => ({ title: 'Bike wash', step: 'Confirm', pricePaise: 49900, link: '/repair/two-wheeler' }),
    build: ({ title, pricePaise, link }) => ({
      push: {
        title: `Your ${String(title || 'booking').toLowerCase()} is one step away`,
        body: `${pricePaise ? `₹${Math.round(pricePaise / 100).toLocaleString('en-IN')}, ` : ''}everything you picked is saved. Tap to finish booking.`,
        link,
      },
    }),
  },
  'booking.rate_reminder': {
    audience: 'customer', type: 'rating_request', channels: ['push'], label: 'Rate and tip reminder (2 h later)',
    sample: () => sampleJob(),
    build: ({ f }) => ({ push: { title: `How was ${prov(f)}?`, body: 'A quick rating helps other customers, and a tip goes entirely to them.', link: f.link } }),
  },

  /* ---------------- Provider ---------------- */
  'provider.job_nearby': {
    audience: 'provider', type: 'job_assigned', channels: ['push'], urgent: true, label: 'New job near you',
    sample: () => ({ label: 'pet care', km: 2.4, area: 'Kondapur', earningPaise: 45000, boostPaise: 2000 }),
    build: ({ label, km, area, earningPaise, boostPaise = 0 }) => ({
      push: {
        title: boostPaise ? `Customer raised the offer: +${rupees(boostPaise)}` : `New ${label} job near you`,
        body: [earningPaise ? `${boostPaise ? `${label} job · ` : ''}Earn ${rupees(earningPaise)}${boostPaise ? ` (incl. ${rupees(boostPaise)} extra, all yours)` : ''}` : null, km != null ? `${Number(km).toFixed(1)} km away` : null, area].filter(Boolean).join(' · ') || 'Open the app to take it.',
        link: '/worker/work',
      },
    }),
  },
  'provider.price_request': {
    audience: 'provider', type: 'job_assigned', channels: ['push'], urgent: true, label: 'A customer asks for your price',
    sample: () => ({ device: 'Samsung Galaxy S23 Ultra', repair: 'Battery Replacement', km: 2.1 }),
    build: ({ device, repair, km }) => ({
      push: {
        title: 'A customer near you wants your price',
        body: `${repair} for a ${device}${km != null ? ` · ${Number(km).toFixed(1)} km away` : ''}. Reply with your price to win the job.`,
        link: '/shop/price-requests',
      },
    }),
  },
  'provider.price_request_closed': {
    audience: 'provider', type: 'job_removed', channels: ['push'], label: 'Price request went elsewhere',
    sample: () => ({ device: 'Samsung Galaxy S23 Ultra', repair: 'Battery Replacement' }),
    build: ({ device, repair }) => ({
      push: { title: 'The customer chose another shop', body: `${repair} for a ${device}. Your price is saved for the next one.`, link: '/shop/price-requests' },
    }),
  },
  'customer.price_offer': {
    audience: 'customer', type: 'order_delayed', channels: ['push'], urgent: true, label: 'A shop sent its price',
    sample: () => ({ shop: 'MB Groups', price: '₹1,450', repair: 'Battery Replacement', id: 'x' }),
    build: ({ shop, price, repair, id }) => ({
      push: { title: `${shop} can do it for ${price}`, body: `${repair}. Compare prices and book the one you like.`, link: `/repair/price-requests/${id}` },
    }),
  },
  'provider.job_waiting': {
    audience: 'provider', type: 'job_reminder', channels: ['push'], urgent: true, label: 'Job waiting (offline providers, 5 min)',
    sample: () => ({ label: 'repair', km: 3.1 }),
    build: ({ label, km }) => ({ push: { title: `A ${label} job near you is waiting`, body: `${km != null ? `${Number(km).toFixed(1)} km away. ` : ''}Nobody has taken it yet. Go online to take it.`, link: '/worker' } }),
  },
  'customer.recurring_booked': {
    audience: 'customer', type: 'order_placed', channels: ['push'], label: 'Repeat booking made',
    sample: () => ({ title: 'Water tank cleaning', when: 'Sun, 12 Oct, 10:00 am', link: '/repair/bookings/x' }),
    build: ({ title, when, link }) => ({
      push: { title: 'Your repeat booking is set', body: `${title}: ${when}. Change or skip it from Your schedule.`, link: link || '/scheduled' },
    }),
  },
  'customer.recurring_failed': {
    audience: 'customer', type: 'order_delayed', channels: ['push'], urgent: true, label: 'Repeat booking could not be made',
    sample: () => ({ title: 'Water tank cleaning', when: 'Sun, 12 Oct, 10:00 am', paused: false }),
    build: ({ title, when, paused }) => ({
      push: {
        title: 'We could not book your repeat',
        body: `${title} on ${when}: nobody was available at that price. Book it yourself in a tap.${paused ? ' We paused this repeat after three misses.' : ''}`,
        link: '/scheduled',
      },
    }),
  },
  'provider.surge_zone': {
    audience: 'provider', type: 'job_reminder', channels: ['push'], urgent: false, label: 'Busy zone near you (surge on)',
    sample: () => ({ service: 'Shopping & pickup', area: 'Madhapur', km: 2.4, sharePct: 60 }),
    build: ({ service, area, km, sharePct }) => ({
      push: {
        title: `Surge on${area ? ` in ${area}` : ' near you'}`,
        body: `${service || 'Jobs'}: more bookings than pros${km != null ? `, ${Number(km).toFixed(1)} km away` : ''}. You keep ${sharePct}% of the surge. Head there to earn more.`,
        link: '/worker',
      },
    }),
  },
  'provider.boost_after_pass': {
    audience: 'provider', type: 'job_reminder', channels: ['push'], urgent: true, label: 'Customer raised the price on a job you passed',
    sample: () => ({ boostRupees: 20, totalBoostRupees: 40, link: '/worker' }),
    build: ({ boostRupees, totalBoostRupees, link }) => ({
      push: {
        title: `Customer added ₹${boostRupees} to a job you passed`,
        body: `It now pays ₹${totalBoostRupees} more, all of it yours. Go online to take it.`,
        link,
      },
    }),
  },
  'provider.job_cancelled': {
    audience: 'provider', type: 'job_removed', channels: ['push'], urgent: true, label: 'Customer cancelled',
    sample: () => sampleJob(),
    build: ({ f }) => ({ push: { title: 'Booking cancelled', body: `The customer cancelled ${f.service} (${f.reference}). Nothing more to do.`, link: f.providerLink } }),
  },
  'provider.offers_paused': {
    audience: 'provider', type: 'penalty_applied', channels: ['push'], urgent: true, label: 'Set offline after passing on offers',
    sample: () => ({ count: 5 }),
    build: ({ count }) => ({ push: { title: 'You are offline for now', body: `You passed on ${count} jobs in a row, so we stopped sending you new ones. Go online again when you are free to take work.`, link: '/worker' } }),
  },
  'provider.paid': {
    audience: 'provider', type: 'worker_earning', channels: ['push'], label: 'Paid for a job',
    sample: () => ({ ...sampleJob(), earningPaise: 220500, cash: true }),
    build: ({ f, earningPaise, cash }) => ({
      push: { title: `You earned ${rupees(earningPaise)}`, body: cash ? `${f.service} (${f.reference}). You collected cash; ZappyOne's commission comes off your wallet.` : `${f.service} (${f.reference}). It is in your wallet.`, link: '/worker/earnings' },
    }),
  },
  'provider.dues': {
    audience: 'provider', type: 'penalty_applied', channels: ['push', 'email'], urgent: true, label: 'Dues warning / jobs paused / payment confirmed',
    sample: () => ({ name: 'Ravi', state: 'warning', duesPaise: 84000, limitPaise: 100000, payInstructions: 'Pay to UPI zappyone@okaxis and tap I have paid' }),
    build: ({ name, state, duesPaise, limitPaise, payInstructions, url }) => {
      const T = {
        warning: [`You owe ${rupees(duesPaise)}`, `New jobs stop at ${rupees(limitPaise)}. Pay some now to keep getting work.`],
        blocked: ['New jobs are paused', `You owe ${rupees(duesPaise)} from cash jobs. Pay it to start getting jobs again.`],
        paid: ['Payment received', duesPaise > 0 ? `Thanks. You now owe ${rupees(duesPaise)}.` : 'Thanks. You owe nothing now.'],
      }[state] || ['Your dues', `You owe ${rupees(duesPaise)}.`];
      return {
        push: { title: T[0], body: T[1], link: '/worker' },
        email: state === 'paid' ? null : {
          subject: T[0], preheader: T[1], heading: T[0],
          intro: [`Hi ${first(name)}, on cash jobs you keep the whole amount and owe ZappyOne its commission. ${T[1]}`],
          rows: [['You owe', rupees(duesPaise)], ['New jobs stop at', rupees(limitPaise)]],
          button: { label: 'Open your dues', url: url('/worker') },
          note: payInstructions ? `How to pay: ${payInstructions}` : '',
        },
      };
    },
  },
  'provider.kyc': {
    audience: 'provider', type: 'report_received', channels: ['push', 'email'], label: 'Verification approved / needs changes',
    sample: () => ({ name: 'Ravi', approved: true, service: 'Mobile Phones', reason: '' }),
    build: ({ name, approved, service, reason, url }) => ({
      push: approved
        ? { title: `You are verified for ${service}`, body: 'Go online to start getting jobs.', link: '/worker' }
        : { title: 'Your verification needs changes', body: reason || 'Open the app to see what to fix.', link: '/provider/onboarding' },
      email: {
        subject: approved ? `You are verified for ${service}` : 'Your verification needs changes',
        preheader: approved ? 'Go online to start getting jobs.' : 'A quick fix and you are ready.',
        heading: approved ? 'You are verified' : 'Your verification needs changes',
        intro: approved
          ? [`Hi ${first(name)}, welcome aboard. You are verified for ${service}. Set your prices and service area, go online, and jobs near you will ring.`]
          : [`Hi ${first(name)}, we could not approve your verification for ${service} yet.`, reason ? `What to fix: ${reason}` : null].filter(Boolean),
        button: approved ? { label: 'Go online', url: url('/worker') } : { label: 'Fix and resubmit', url: url('/provider/onboarding') },
      },
    }),
  },
  'provider.weekly_summary': {
    audience: 'provider', type: 'milestone_reached', channels: ['email'], label: 'Weekly earnings summary (Monday)',
    sample: () => ({ name: 'Ravi', jobs: 14, earnedPaise: 1876000, tipsPaise: 15000, rating: 4.8, duesPaise: 0, week: '29 Sep – 5 Oct' }),
    build: ({ name, jobs, earnedPaise, tipsPaise, rating, duesPaise, week, url }) => ({
      email: {
        subject: `Your week: ${jobs} job${jobs === 1 ? '' : 's'}, ${rupees(earnedPaise)} earned`,
        preheader: `Week of ${week}.`,
        heading: `Your week, ${week}`,
        intro: [`Hi ${first(name)}, here is how your week went.`],
        rows: [['Jobs done', String(jobs)], ['Earned', rupees(earnedPaise)], ['Tips', tipsPaise ? rupees(tipsPaise) : null], ['Rating', rating ? `★ ${Number(rating).toFixed(1)}` : null], ['You owe ZappyOne', duesPaise ? rupees(duesPaise) : null]],
        button: { label: 'See your earnings', url: url('/worker/earnings') },
      },
    }),
  },

  /* ---------------- Admin / ops ---------------- */
  'admin.daily_summary': {
    audience: 'ops', type: 'report_received', channels: ['email'], label: 'Daily business summary (8 am)',
    sample: () => ({ day: 'Mon, 6 Oct', bookings: 42, completed: 35, cancelled: 4, gmvPaise: 8640000, takePaise: 912000, newCustomers: 11, stuck: 2, kycWaiting: 3 }),
    build: ({ day, bookings, completed, cancelled, gmvPaise, takePaise, newCustomers, stuck, kycWaiting, url }) => ({
      email: {
        subject: `ZappyOne yesterday: ${bookings} bookings, ${rupees(gmvPaise)}`,
        preheader: `${completed} completed · ${cancelled} cancelled · ${rupees(takePaise)} earned`,
        heading: `Yesterday, ${day}`,
        rows: [['Bookings', String(bookings)], ['Completed', String(completed)], ['Cancelled', String(cancelled)], ['Value of jobs', rupees(gmvPaise)], ['ZappyOne earned', rupees(takePaise)], ['New customers', String(newCustomers)], ['Jobs needing a person now', String(stuck)], ['Verifications waiting', String(kycWaiting)]],
        button: { label: 'Open Insights', url: url('/dashboard?tab=insights') },
      },
    }),
  },
  'admin.sos': {
    audience: 'ops', type: 'worker_sos', channels: ['email'], urgent: true, label: 'SOS raised',
    sample: () => ({ who: 'Customer Aarav (98xxxxxx10)', reference: 'RP7K2Q9M', area: 'Madhapur', at: 'Mon, 6 Oct, 9:41 pm' }),
    build: ({ who, reference, area, at, url }) => ({
      email: {
        subject: `SOS: ${reference || 'live job'} · ${area || ''}`.trim(),
        preheader: `${who} raised an SOS. Act now.`,
        heading: 'An SOS was raised',
        intro: [`${who} raised an SOS. 112 was dialled on their phone. Call them now and follow the safety steps.`],
        rows: [['Booking', reference], ['Area', area], ['Time', at]],
        button: { label: 'Open the SOS panel', url: url('/dashboard?tab=liveops') },
      },
    }),
  },
  'ops.customer_flagged': {
    audience: 'ops', type: 'report_received', channels: ['email'], urgent: true, label: 'Customer flagged by providers',
    sample: () => ({ name: 'Aarav', phone: '98xxxxxx10', avg: 2.3, count: 4, unsafe: false, reference: 'RP7K2Q9M' }),
    build: ({ name, phone, avg, count, unsafe, reference, url }) => ({
      email: {
        subject: unsafe ? `Provider felt unsafe with ${name}` : `${name} is rated ${avg}★ by providers`,
        preheader: unsafe ? 'Check this customer before their next booking.' : `${count} ratings, average ${avg}.`,
        heading: unsafe ? 'A provider felt unsafe' : 'A customer is rated low by providers',
        intro: [unsafe
          ? `A provider marked "I felt unsafe" after ${reference || 'a job'}. Call the provider, then decide on this customer.`
          : `Providers have rated ${name} ${avg}★ over ${count} jobs. Look at the notes before their next booking.`],
        rows: [['Customer', `${name} · ${phone}`], ['Average', `${avg}★ (${count})`], ['Last job', reference]],
        button: { label: 'Open Customers', url: url('/dashboard?tab=customers') },
      },
    }),
  },
  'ops.shop_payout': {
    audience: 'ops', type: 'report_received', channels: ['email'], label: 'A shop asked for a payout',
    sample: () => ({ shop: 'MB Groups', amount: '₹4,200', to: 'HDFC ••1234' }),
    build: ({ shop, amount, to, url }) => ({
      email: {
        subject: `${shop} asked for ${amount}`,
        preheader: `Pay to ${to}, then mark it paid.`,
        heading: 'A shop asked for a payout',
        intro: [`${shop} asked for ${amount} to ${to}. Send it, then mark it paid with the reference.`],
        rows: [['Shop', shop], ['Amount', amount], ['To', to]],
        button: { label: 'Open payouts', url: url('/dashboard?tab=money') },
      },
    }),
  },
  'ops.partner_paused': {
    audience: 'ops', type: 'report_received', channels: ['email'], urgent: true, label: 'Event partner paused for cancelling',
    sample: () => ({ partner: 'Dream Decor', phone: '98xxxxxx10', strikes: 3, windowDays: 90 }),
    build: ({ partner, phone, strikes, windowDays, url }) => ({
      email: {
        subject: `${partner} paused: ${strikes} cancellations`,
        preheader: 'Their listings are hidden until you review them.',
        heading: 'An event partner was paused',
        intro: [`${partner} cancelled ${strikes} confirmed bookings in ${windowDays} days, so their listings are hidden and new bookings stopped. Talk to them, then reinstate them from Event commerce if it is sorted.`],
        rows: [['Partner', `${partner} · ${phone}`], ['Cancellations', `${strikes} in ${windowDays} days`]],
        button: { label: 'Open Event commerce', url: url('/dashboard?tab=events') },
      },
    }),
  },
  'admin.kyc_review': {
    audience: 'ops', type: 'report_received', channels: ['email'], label: 'New verification to review',
    sample: () => ({ who: 'Ravi Kumar (worker)', service: 'Mobile Phones' }),
    build: ({ who, service, url }) => ({
      email: {
        subject: `To review: ${who} for ${service}`,
        preheader: 'A provider is waiting for verification.',
        heading: 'A verification is waiting',
        intro: [`${who} submitted their documents for ${service}. Providers can only take jobs once verified.`],
        button: { label: 'Review now', url: url('/dashboard?tab=verification') },
      },
    }),
  },
};

module.exports = { CATALOG };
