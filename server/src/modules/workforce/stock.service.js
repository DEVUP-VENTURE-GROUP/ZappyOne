/**
 * Dark-store stock (Admin → Fleet → Stock):
 *
 *   purchase  parts bought for a hub: quantity up, average cost updated, and
 *             the spend recorded once as a 'parts' expense (workforce/finance)
 *   issue     handed to a staff member for a job: quantity down; its value at
 *             average cost is what the job used
 *   adjust    a count found more or fewer than recorded
 *
 * Never below zero on an issue: what is not on the shelf cannot go out.
 */
const { StockItem, StockMove } = require('./stock.model');
const Expense = require('./expense.model');

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

async function items(hubId) {
  const list = await StockItem.find(hubId ? { hubId } : {}).sort({ name: 1 }).populate('hubId', 'name').lean();
  return list.map((i) => ({ ...i, valuePaise: Math.round(Math.max(0, i.qty) * i.avgCostPaise), low: i.reorderAt > 0 && i.qty <= i.reorderAt }));
}

async function addItem({ hubId, name, sku = '', unit = 'piece', reorderAt = 0 }) {
  try { return (await StockItem.create({ hubId, name, sku, unit, reorderAt })).toObject(); } catch (e) {
    if (e.code === 11000) throw err(409, 'EXISTS', 'That item is already at this hub.');
    throw e;
  }
}

async function purchase({ itemId, qty, unitCostPaise, supplier = '', note = '', day = today(), by = null, receiptKey = '' }) {
  if (!(qty > 0)) throw err(400, 'QTY', 'Enter how many came in.');
  const item = await StockItem.findById(itemId);
  if (!item) throw err(404, 'NOT_FOUND', 'Item not found.');
  const onHand = Math.max(0, item.qty);
  item.avgCostPaise = Math.round((onHand * item.avgCostPaise + qty * unitCostPaise) / (onHand + qty));
  item.qty += qty;
  await item.save();
  const move = await StockMove.create({ hubId: item.hubId, itemId, type: 'purchase', qty, unitCostPaise, supplier, note, day, by });
  // The money side: one 'parts' expense for the hub, with its receipt.
  await Expense.create({ hubId: item.hubId, category: 'parts', amountPaise: Math.round(qty * unitCostPaise), day, note: `${qty} ${item.unit} ${item.name}${supplier ? ` from ${supplier}` : ''}`, receiptKey, createdBy: by });
  return { item: item.toObject(), move: move.toObject() };
}

async function issue({ itemId, qty, workerId = null, jobRef = '', note = '', day = today(), by = null }) {
  if (!(qty > 0)) throw err(400, 'QTY', 'Enter how many went out.');
  const item = await StockItem.findOneAndUpdate({ _id: itemId, qty: { $gte: qty } }, { $inc: { qty: -qty } }, { new: true });
  if (!item) throw err(409, 'SHORT', 'Not enough on the shelf for that.');
  const move = await StockMove.create({ hubId: item.hubId, itemId, type: 'issue', qty: -qty, unitCostPaise: item.avgCostPaise, workerId, jobRef, note, day, by });
  return { item: item.toObject(), move: move.toObject() };
}

async function adjust({ itemId, countedQty, note = '', day = today(), by = null }) {
  const item = await StockItem.findById(itemId);
  if (!item) throw err(404, 'NOT_FOUND', 'Item not found.');
  const diff = countedQty - item.qty;
  item.qty = countedQty;
  await item.save();
  const move = diff ? await StockMove.create({ hubId: item.hubId, itemId, type: 'adjust', qty: diff, unitCostPaise: item.avgCostPaise, note, day, by }) : null;
  return { item: item.toObject(), move: move?.toObject() || null };
}

async function moves({ hubId, month }) {
  const filter = { ...(hubId ? { hubId } : {}), ...(month ? { day: { $gte: `${month}-01`, $lte: `${month}-31` } } : {}) };
  return StockMove.find(filter).sort({ createdAt: -1 }).limit(300).populate('itemId', 'name unit').populate('workerId', 'name').lean();
}

module.exports = { items, addItem, purchase, issue, adjust, moves };
