// Talking to ZappyOne: the ops team hears every new ticket and message, and whoever raised it hears every reply, so a ticket works like a chat.
const logger = require('../../core/logger');

const HOME = { user: '/support', worker: '/worker/support', shop: '/shop/support', event_partner: '/partner/support' };
const WHO = { user: 'Customer', worker: 'Pro', shop: 'Partner', event_partner: 'Event partner' };
const short = (text) => (String(text || '').length > 120 ? `${String(text).slice(0, 117)}…` : String(text || ''));

function toAdmin(ticket, text, { isNew = false } = {}) {
  require('../admin/ops-alerts').raise({
    type: 'support_message',
    title: `${WHO[ticket.raisedBy.kind] || 'Someone'} ${isNew ? 'opened' : 'wrote on'}: ${ticket.subject}`,
    body: short(text),
    data: { ticketId: String(ticket._id), category: ticket.category, kind: ticket.raisedBy.kind },
    urgent: ticket.category === 'complaint' || ticket.priority === 'urgent',
  }).catch((e) => logger.warn({ err: e.message }, '[support] ops alert failed'));
}

function toRaiser(ticket, text) {
  require('../notification/notification.service').notify({
    recipient: { kind: ticket.raisedBy.kind, id: ticket.raisedBy.id },
    type: 'report_received',
    title: 'ZappyOne replied',
    body: short(text),
    deepLink: `${HOME[ticket.raisedBy.kind] || '/support'}?ticket=${ticket._id}`,
    data: { ticketId: String(ticket._id) },
  }).catch((e) => logger.warn({ err: e.message }, '[support] reply alert failed'));
}

// Who raised each ticket, so admin can tell a customer from a partner; one read per kind of account.
async function withRaisers(tickets) {
  const ids = (kind) => tickets.filter((t) => t.raisedBy?.kind === kind).map((t) => t.raisedBy.id);
  const [users, workers, shops, partners] = await Promise.all([
    require('../user/user.model').find({ _id: { $in: ids('user') } }).select('name phone').lean(),
    require('../worker/worker.model').find({ _id: { $in: ids('worker') } }).select('name phone').lean(),
    require('../shop/shop.model').find({ _id: { $in: ids('shop') } }).select('businessName phone').lean(),
    require('../events/event-partner.model').find({ _id: { $in: ids('event_partner') } }).select('businessName phone').lean(),
  ]);
  const who = new Map([...users, ...workers, ...shops, ...partners].map((p) => [String(p._id), { name: p.name || p.businessName || '', phone: p.phone || '' }]));
  return tickets.map((t) => ({ ...t, raiser: who.get(String(t.raisedBy?.id)) || null }));
}

module.exports = { toAdmin, toRaiser, withRaisers, HOME };
