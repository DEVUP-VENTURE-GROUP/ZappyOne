// Siri and Shortcuts for the customer app: an App Intents extension whose shortcuts open the app at a link (added at build time by @bacons/apple-targets).
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'app-intent',
  name: 'ZappyShortcuts',
  // Opening the app from a shortcut (OpenURLIntent) is iOS 18; older iPhones simply do not list these shortcuts. apple-targets builds app-intent targets for 17.0 regardless, so ZappyShortcuts.swift marks the intents @available(iOS 18.0, *).
  deploymentTarget: '18.0',
  frameworks: ['AppIntents'],
};
