/**
 * Skill Auction — Competitive Bidding for Premium Jobs
 * ---------------------------------------------------------------------------
 * Jobs over ₹1500 enter "auction mode" instead of sequential dispatch.
 * Up to 5 workers submit: approach text, proposed price, ETA.
 * Customer sees all bids and picks the best one.
 *
 * Creates TRUST through transparency. Customer picks, not algorithm.
 * Workers compete on quality, not just proximity.
 * Zero Indian competitors have this.
 * ---------------------------------------------------------------------------
 */

const JobAuction = require('./auction.model');
const Order      = require('./order.model');
const Worker     = require('../worker/worker.model');
const { redis }  = require('../../config/redis');
const logger     = require('../../core/logger');

const AUCTION_THRESHOLD = 1500;  // orders > ₹1500 qualify
const MAX_BIDS          = 5;

async function submitBid({ auctionId, orderId, workerId, proposedPrice, etaMinutes, approach }) {
  const auction = await JobAuction.findOne({ _id: auctionId, orderId, status: 'open' });
  if (!auction) throw Object.assign(new Error('Auction not found or closed'), { status: 404 });
  if (auction.expiresAt < new Date()) throw Object.assign(new Error('Auction has expired'), { status: 410 });
  if (auction.bids.length >= MAX_BIDS) throw Object.assign(new Error('Auction is full'), { status: 409 });

  const alreadyBid = auction.bids.some(b => String(b.workerId) === String(workerId));
  if (alreadyBid) throw Object.assign(new Error('You already submitted a bid'), { status: 409 });

  const worker = await Worker.findById(workerId).select('name rating completedJobs').lean();

  auction.bids.push({
    workerId,
    proposedPrice,
    etaMinutes,
    approach,
    workerRating: worker?.rating,
    workerJobs:   worker?.completedJobs,
    workerName:   worker?.name,
  });
  await auction.save();

  /* Notify customer new bid arrived */
  await redis.publish('order:event', JSON.stringify({
    orderId: String(orderId),
    event:   'auction.bid',
    payload: {
      auctionId:    String(auctionId),
      totalBids:    auction.bids.length,
      latestBid: {
        proposedPrice, etaMinutes, approach,
        workerRating: worker?.rating,
        workerName:   worker?.name ? worker.name.split(' ')[0] : 'Worker',
      },
    },
  }));

  logger.info({ auctionId, workerId, proposedPrice }, '[Auction] Bid submitted');
  return auction;
}

async function selectBid({ auctionId, orderId, userId, bidId }) {
  const auction = await JobAuction.findOne({ _id: auctionId, orderId, status: 'open' });
  if (!auction) throw Object.assign(new Error('Auction not found'), { status: 404 });

  const order = await Order.findById(orderId).select('userId pricing').lean();
  if (!order || String(order.userId) !== String(userId)) {
    throw Object.assign(new Error('Not your order'), { status: 403 });
  }

  const bid = auction.bids.id(bidId);
  if (!bid) throw Object.assign(new Error('Bid not found'), { status: 404 });

  auction.status      = 'assigned';
  auction.winnerId    = bid.workerId;
  auction.winnerBidId = bid._id;
  await auction.save();

  /* Update order pricing to winning bid price */
  await Order.findByIdAndUpdate(orderId, {
    $set: { 'pricing.total': bid.proposedPrice },
  });

  /* Dispatch to winner directly */
  await redis.publish('worker:offer', JSON.stringify({
    workerId: String(bid.workerId),
    order: {
      _id:          String(orderId),
      service:      'auction_win',
      pickupAddress: order.pricing ? '' : '',
      price:         bid.proposedPrice,
      auctionWin:    true,
      expiresAt:     new Date(Date.now() + 30000).toISOString(),
    },
  }));

  /* Notify other bidders auction closed */
  for (const b of auction.bids) {
    if (String(b.workerId) !== String(bid.workerId)) {
      await redis.publish('worker:offer_cancel', JSON.stringify({
        workerId: String(b.workerId), orderId: String(orderId),
      }));
    }
  }

  logger.info({ auctionId, winner: bid.workerId, price: bid.proposedPrice }, '[Auction] Bid selected');
  return { auction, winnerBid: bid };
}

async function getAuction(orderId) {
  return JobAuction.findOne({ orderId }).lean();
}

module.exports = { submitBid, selectBid, getAuction, AUCTION_THRESHOLD };
