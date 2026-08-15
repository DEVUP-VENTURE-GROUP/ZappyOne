/**
 * Reduced-motion preference.
 * ----------------------------------------------------------------------------
 * The website honours `prefers-reduced-motion` by disabling every keyframe
 * animation and the skeleton shimmer. This is the native equivalent, reading
 * the OS accessibility setting on both platforms.
 * ----------------------------------------------------------------------------
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduced(enabled);
      })
      .catch(() => {
        // Setting unavailable — assume motion is fine.
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setReduced(enabled),
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
