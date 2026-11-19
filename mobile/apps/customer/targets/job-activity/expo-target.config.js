// The customer app's Live Activity widget extension (Lock Screen and Dynamic Island), added at build time by @bacons/apple-targets.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'JobActivity',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: { $accent: '#1F4FD8', brand: '#1F4FD8', ink: '#101828', muted: '#5B6474', track: '#E3E6EB' },
};
