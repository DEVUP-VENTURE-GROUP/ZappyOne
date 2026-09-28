/**
 * Order service: one entry point for the order lifecycle. Each concern lives
 * in its own file under services/.
 */
const orderRepo = require('./order.repository');

module.exports = {
  ...require('./services/create.service'),
  ...require('./services/lifecycle.service'),
  ...require('./services/cancel-flows.service'),
  ...require('./services/rating.service'),
  ...require('./services/followup.service'),
  getOrder: (id) => orderRepo.findByIdWithOtp(id),
  listByUser: async (userId, opts) => {
    const [orders, total] = await Promise.all([
      orderRepo.listByUser(userId, opts),
      orderRepo.countByUser(userId),
    ]);
    return [orders, total];
  },
  listByWorker: (workerId, opts) => orderRepo.listByWorker(workerId, opts),
};
