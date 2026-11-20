// Pictures in notifications: iOS hands this extension each push marked mutable-content, it downloads the picture and shows it on the notification (added by @bacons/apple-targets).
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'notification-service',
  name: 'NotificationService',
  deploymentTarget: '15.1',
};
