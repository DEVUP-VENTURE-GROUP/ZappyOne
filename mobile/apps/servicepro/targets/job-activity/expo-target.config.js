// The app's Live Activity (Lock Screen, Dynamic Island) and Home Screen widget extension, added at build time by @bacons/apple-targets.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'JobActivity',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  // Shared with the app: the Home Screen widget reads the current job the app writes there.
  entitlements: { 'com.apple.security.application-groups': ['group.com.zappyone.servicepro'] },
  infoPlist: { ZappyAppGroup: 'group.com.zappyone.servicepro' },
  colors: { $accent: '#1F4FD8', brand: '#1F4FD8', ink: '#101828', muted: '#5B6474', track: '#E3E6EB' },
};
