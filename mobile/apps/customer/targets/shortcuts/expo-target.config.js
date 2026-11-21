// Siri and Shortcuts for the customer app: an App Intents extension whose shortcuts open the app at a link (added at build time by @bacons/apple-targets).
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'app-intent',
  name: 'ZappyShortcuts',
  // apple-targets builds app-intent extensions for iOS 17 whatever is set here, so the Swift marks the shortcuts iOS 18 (OpenURLIntent); older iPhones do not list them.
  deploymentTarget: '18.0',
  frameworks: ['AppIntents'],
};
