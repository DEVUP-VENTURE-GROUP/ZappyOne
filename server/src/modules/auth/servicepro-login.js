// One sign-in for every ServicePro partner: the code is checked once, then the number's accounts decide what happens (one opens straight away, several are offered, none starts sign-up), and a 5-minute ticket carries the verified number between those steps.
const jwt = require('jsonwebtoken');
const config = require('../../config');
const authService = require('./auth.service');
const Shop = require('../shop/shop.model');
const Worker = require('../worker/worker.model');

const TICKET = { purpose: 'servicepro_login', ttl: '5m' };
const err = (status, code, message) => Object.assign(new Error(message), { status, code });

const signTicket = (phone) => jwt.sign({ phone, p: TICKET.purpose }, config.jwt.secret, { expiresIn: TICKET.ttl });
function phoneFromTicket(ticket) {
  try {
    const t = jwt.verify(ticket, config.jwt.secret);
    if (t.p !== TICKET.purpose || !t.phone) throw new Error('wrong purpose');
    return t.phone;
  } catch { throw err(401, 'TICKET_EXPIRED', 'That took too long. Enter your number again.'); }
}

// Every ServicePro account on this number. Independent technicians (no shop) belong to Rakshak and are not listed.
async function accountsFor(phone) {
  const EventPartner = require('../events/event-partner.model');
  const [shop, worker, partner] = await Promise.all([
    Shop.findOne({ phone }).select('businessName partnerType isBlocked').lean(),
    Worker.findOne({ phone, shopId: { $ne: null } }).select('name shopId isBlocked').lean(),
    EventPartner.findOne({ phone }).select('businessName isBlocked').lean(),
  ]);
  const shopName = worker ? (await Shop.findById(worker.shopId).select('businessName').lean())?.businessName : null;
  return [
    shop && !shop.isBlocked && { role: 'shop', name: shop.businessName, kind: shop.partnerType || 'shop' },
    worker && !worker.isBlocked && { role: 'worker', name: worker.name, kind: 'technician', shopName },
    partner && !partner.isBlocked && { role: 'event_partner', name: partner.businessName, kind: 'events' },
  ].filter(Boolean);
}

async function open(role, phone, { deviceId } = {}) {
  const pre = { preVerified: true };
  if (role === 'shop') { const r = await authService.loginShopWithOtp({ phone }, pre); return { ...r, account: r.shop }; }
  if (role === 'worker') { const r = await authService.loginWorkerWithOtp({ phone, deviceId, portal: 'servicepro' }, pre); return { ...r, account: r.worker }; }
  const r = await authService.loginEventPartnerWithOtp({ phone }, pre);
  return { ...r, account: r.partner };
}

async function login({ phone, otp, ticket, role, deviceId }) {
  let verified;
  if (ticket) verified = phoneFromTicket(ticket);
  else {
    if (!await authService.verifyOtp(phone, otp)) throw err(401, 'OTP_INVALID', 'That code is not right. Check it and try again.');
    verified = phone;
  }
  const accounts = await accountsFor(verified);
  const pick = role ? accounts.find((a) => a.role === role) : accounts.length === 1 ? accounts[0] : null;
  if (role && !pick) throw err(404, 'NO_SUCH_ACCOUNT', 'This number has no account of that kind.');
  if (!pick) return { ticket: signTicket(verified), accounts, needsRegistration: accounts.length === 0 };
  return { role: pick.role, ...(await open(pick.role, verified, { deviceId })) };
}

// A new partner: a business or solo pro for doorstep services (a shop account of the right kind), or an event partner.
async function register({ ticket, kind, businessName, ownerName, partnerType = 'individual', acceptTerms, cities }) {
  const phone = phoneFromTicket(ticket);
  const existing = await accountsFor(phone);
  if (kind === 'events') {
    if (existing.some((a) => a.role === 'event_partner')) throw err(409, 'ALREADY_REGISTERED', 'This number already has an event partner account.');
    const r = await authService.loginEventPartnerWithOtp({ phone, businessName, ownerName, cities }, { preVerified: true });
    return { role: 'event_partner', ...r, account: r.partner };
  }
  if (existing.some((a) => a.role === 'shop')) throw err(409, 'ALREADY_REGISTERED', 'This number already has a ServicePro business account.');
  const r = await authService.loginShopWithOtp({ phone, businessName, ownerName, partnerType, acceptTerms }, { preVerified: true });
  return { role: 'shop', ...r, account: r.shop };
}

module.exports = { login, register, accountsFor };
