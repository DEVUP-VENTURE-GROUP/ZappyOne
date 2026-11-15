/**
 * Bottom padding for a customer tab screen's scrolling content, so the last
 * row can scroll clear of the tab bar.
 * ----------------------------------------------------------------------------
 * Custom bar (Android, iOS < 26): the bar's clearance plus the home-indicator
 * inset, as before.
 *
 * Native Liquid Glass bar (iOS 26+): content scrolls *under* the floating
 * glass. Inside a native tab the safe-area bottom inset already includes the
 * bar (UIKit reports it to the tab's own SafeAreaProvider), so only a little
 * breathing room is added on top. Its height can't be measured from JS, so
 * nothing here hard-codes it.
 * ----------------------------------------------------------------------------
 */

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIQUID_GLASS } from '../components/ui/Glass';
import { bottomNavClearance, spacing } from '../theme/spacing';

export function useTabBarSpace(): number {
  const { bottom } = useSafeAreaInsets();
  return LIQUID_GLASS ? bottom + spacing.lg : bottomNavClearance + bottom;
}
