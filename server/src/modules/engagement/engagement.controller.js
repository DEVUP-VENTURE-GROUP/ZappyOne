const chatService = require('../chat/chat.service');
const callingService = require('../chat/calling.service');
const Order = require('../order/order.model');
const Worker = require('../worker/worker.model');
const Feedback = require('../order/feedback.model');
const SupportTicket = require('./support-ticket.model');

async function sendChat(req, res, next) {
  try {
    if (!['user', 'worker'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Only parties to an order can chat' });
    }
    const msg = await chatService.sendMessage({
      orderId: req.params.orderId,
      fromKind: req.auth.role,
      fromId: req.auth.sub,
      text: req.body.text,
      cannedCode: req.body.cannedCode,
    });
    res.status(201).json({ message: msg });
  } catch (err) { next(err); }
}

async function listChat(req, res, next) {
  try {
    const messages = await chatService.listMessages({
      orderId: req.params.orderId,
      participantKind: req.auth.role,
      participantId: req.auth.sub,
      before: req.query.before,
      limit: Number(req.query.limit) || 50,
    });
    const unread = await chatService.unreadCount({
      orderId: req.params.orderId,
      participantKind: req.auth.role,
      participantId: req.auth.sub,
    });
    res.json({ messages, unread });
  } catch (err) { next(err); }
}

async function startCall(req, res, next) {
  try {
    if (!['user', 'worker'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const session = await callingService.startCall({
      orderId: req.params.orderId,
      callerKind: req.auth.role,
      callerId: req.auth.sub,
    });
    res.json(session);
  } catch (err) { next(err); }
}

async function callProviderWebhook(req, res, next) {
  try {
    const { sessionId, event, callId, durationSec, recordingUrl } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    await callingService.recordProviderEvent({
      sessionId, event, providerCallId: callId, durationSec, recordingUrl,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function getWorkerPublicProfile(req, res, next) {
  try {
    const w = await Worker.findById(req.params.id).select(
      'name rating completedJobs skills kyc.status kyc.selfieUrl createdAt'
    ).lean();
    if (!w) return res.status(404).json({ error: 'Worker not found' });
    res.json({
      worker: {
        _id: w._id,
        name: w.name,
        rating: w.rating,
        completedJobs: w.completedJobs,
        skills: w.skills,
        isVerified: w.kyc?.status === 'approved',
        photoUrl: w.kyc?.selfieUrl,
        memberSince: w.createdAt,
      },
    });
  } catch (err) { next(err); }
}

async function submitFeedback(req, res, next) {
  try {
    if (!['user', 'worker'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const order = await Order.findById(req.params.orderId).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const isParty =
      (req.auth.role === 'user' && String(order.userId) === String(req.auth.sub)) ||
      (req.auth.role === 'worker' && String(order.workerId || '') === String(req.auth.sub));
    if (!isParty) return res.status(403).json({ error: 'Not a party to this order' });

    if (order.status !== 'completed') {
      return res.status(409).json({ error: 'Feedback only on completed orders' });
    }

    try {
      const fb = await Feedback.create({
        orderId: req.params.orderId,
        from: { kind: req.auth.role, id: req.auth.sub },
        ...req.body,
      });
      res.status(201).json({ feedback: fb });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: 'Feedback already submitted', code: 'FEEDBACK_EXISTS' });
      }
      throw err;
    }
  } catch (err) { next(err); }
}

async function createTicket(req, res, next) {
  try {
    if (!['user', 'worker', 'shop', 'event_partner'].includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const slaHours = { urgent: 1, high: 2, normal: 4, low: 24 }[req.body.priority] || 4;
    const ticket = await SupportTicket.create({
      ...req.body,
      raisedBy: { kind: req.auth.role, id: req.auth.sub },
      slaDeadline: new Date(Date.now() + slaHours * 3600 * 1000),
      messages: [{ from: req.auth.role, fromId: req.auth.sub, text: req.body.description }],
    });
    require('./support-notify').toAdmin(ticket, req.body.description, { isNew: true });
    res.status(201).json({ ticket });
  } catch (err) { next(err); }
}

async function listMyTickets(req, res, next) {
  try {
    const tickets = await SupportTicket.find({
      'raisedBy.kind': req.auth.role,
      'raisedBy.id': req.auth.sub,
    }).sort({ createdAt: -1 }).lean();
    res.json({ tickets });
  } catch (err) { next(err); }
}

async function getTicket(req, res, next) {
  try {
    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      'raisedBy.kind': req.auth.role,
      'raisedBy.id': req.auth.sub,
    }).lean();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ticket });
  } catch (err) { next(err); }
}

async function addTicketMessage(req, res, next) {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (String(ticket.raisedBy.id) !== String(req.auth.sub) && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Not your ticket' });
    }
    ticket.messages.push({ from: req.auth.role, fromId: req.auth.sub, text: req.body.text });
    if (ticket.status === 'waiting_user' && req.auth.role !== 'admin') {
      ticket.status = 'in_progress';
    }
    await ticket.save();
    if (req.auth.role === 'admin') require('./support-notify').toRaiser(ticket, req.body.text);
    else require('./support-notify').toAdmin(ticket, req.body.text);
    res.json({ ticket });
  } catch (err) { next(err); }
}

async function adminListTickets(req, res, next) {
  try {
    const page  = Math.max(1, Number(req.query.page) || 1);
    const limit = 50;
    const filter = {};
    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.priority) filter.priority  = req.query.priority;
    if (req.query.category) filter.category  = req.query.category;
    if (req.query.kind)     filter['raisedBy.kind'] = req.query.kind;
    const [items, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ priority: -1, slaDeadline: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);
    res.json({ tickets: await require('./support-notify').withRaisers(items), total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
}

async function adminReplyTicket(req, res, next) {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    ticket.messages.push({ from: 'admin', fromId: req.auth.sub, text: req.body.text, at: new Date() });
    if (!ticket.firstResponseAt) ticket.firstResponseAt = new Date();
    if (!ticket.assignedTo) ticket.assignedTo = req.auth.sub;
    if (req.body.status) {
      ticket.status = req.body.status;
      if (req.body.status === 'resolved') ticket.resolvedAt = new Date();
    } else if (ticket.status === 'open') {
      ticket.status = 'in_progress';
    }
    await ticket.save();
    require('./support-notify').toRaiser(ticket, req.body.text);
    await require('../admin/audit.service').fromRequest(req, 'admin.support_reply', { kind: 'ticket', id: req.params.id }, null, { text: req.body.text, status: req.body.status });
    res.json({ ticket });
  } catch (err) { next(err); }
}

async function adminUpdateTicketStatus(req, res, next) {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    ticket.status = req.body.status;
    if (!ticket.firstResponseAt) ticket.firstResponseAt = new Date();
    if (req.body.status === 'resolved') ticket.resolvedAt = new Date();
    if (req.body.note) {
      ticket.messages.push({ from: 'admin', fromId: req.auth.sub, text: req.body.note });
    }
    if (!ticket.assignedTo) ticket.assignedTo = req.auth.sub;
    await ticket.save();
    res.json({ ticket });
  } catch (err) { next(err); }
}

async function getSuggestions(req, res, next) {
  try {
    const recent = await Order.find({ userId: req.auth.sub, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(20)
      .select('service pickupLocation completedAt workerId pricing.total')
      .lean();

    const byService = new Map();
    for (const o of recent) {
      if (!byService.has(o.service)) byService.set(o.service, o);
    }

    const suggestions = Array.from(byService.values()).slice(0, 3).map((o) => ({
      service: o.service,
      lastBookedAt: o.completedAt,
      lastAddress: o.pickupLocation?.address,
      lastCoords: o.pickupLocation?.coordinates,
      lastPrice: o.pricing?.total,
      preferredWorkerId: o.workerId,
    }));

    res.json({ recent: recent.slice(0, 10), suggestions });
  } catch (err) { next(err); }
}

module.exports = {
  sendChat, listChat, startCall, callProviderWebhook,
  getWorkerPublicProfile, submitFeedback,
  createTicket, listMyTickets, getTicket, addTicketMessage,
  adminListTickets, adminUpdateTicketStatus, adminReplyTicket,
  getSuggestions,
};
