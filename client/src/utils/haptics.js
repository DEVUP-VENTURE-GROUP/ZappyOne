/**
 * Lightweight haptic feedback (mobile). No-ops silently where unsupported.
 * Gives the app that native, tactile "Zepto/Uber" feel on key interactions.
 */
function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch { /* unsupported — ignore */ }
}

export const haptics = {
  light:   () => vibrate(8),           // taps, toggles
  medium:  () => vibrate(16),          // confirmations
  success: () => vibrate([12, 40, 18]),// booking placed, reward won
  warning: () => vibrate([20, 60, 20]),// destructive / caution
  tick:    () => vibrate(5),           // pull-to-refresh threshold
};

export default haptics;
