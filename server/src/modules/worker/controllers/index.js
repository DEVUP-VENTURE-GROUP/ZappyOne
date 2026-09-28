/** Worker (Rakshak) panel handlers, one file per concern. */
module.exports = {
  ...require('./duty.controller'),
  ...require('./schedule.controller'),
  ...require('./profile.controller'),
  ...require('./insights.controller'),
};
