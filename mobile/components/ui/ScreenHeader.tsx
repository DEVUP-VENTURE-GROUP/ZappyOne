/**
 * ScreenHeader — the back-and-title bar at the top of a pushed route.
 * ----------------------------------------------------------------------------
 * A port of the sticky header the new website puts on every pushed page, e.g.
 * `client/src/pages/AllServicesPage.jsx`:
 *
 *   <header className="sticky top-0 z-20 border-b border-slate-100 bg-white">
 *     <div className="flex items-center gap-3 px-4 py-3">
 *       <button className="h-9 w-9 rounded-xl bg-slate-100"><ArrowLeft/></button>
 *       <div>
 *         <p className="font-bold text-[#0F172A]">All services</p>
 *         <p className="text-xs text-slate-400">What we can do for you today</p>
 *       </div>
 *     </div>
 *   </header>
 *
 * ── WHY THIS MOVED OUT OF `Misc.tsx` ───────────────────────────────────────
 * It used to live there as a four-line component: an icon button and a title,
 * no subtitle, no rule, no surface of its own. Misc is explicitly for things
 * that are "a handful of lines"; once this grew a subtitle, a bottom rule and
 * safe-area handling it stopped qualifying. The export surface is unchanged —
 * `ScreenHeader` and `ScreenHeaderProps` still come from `@/components/ui`, so
 * the 13 screens already using it keep working untouched.
 *
 * ── WHY THE BACK BUTTON IS 44pt, NOT THE WEB'S 36 ──────────────────────────
 * The web square is `h-9 w-9` (36px), which is a fine mouse target and a poor
 * thumb one — below both the WCAG 2.5.5 and Apple HIG 44pt minimum that
 * `theme/spacing.minTouchTarget` encodes. `IconButton` is already 44pt with
 * `radius.button` corners and a `slate[100]` surface, i.e. the same shape at
 * the right size, so this reuses it rather than rebuilding a smaller one.
 * Client visual language, native touch ergonomics.
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

export interface ScreenHeaderProps {
  title?: string;
  /** The muted line under the title — the website's `text-xs text-slate-400`. */
  subtitle?: string;
  onBack?: () => void;
  /** Rendered at the trailing edge — e.g. a notification bell or an action. */
  right?: React.ReactNode;
  /**
   * Adds the top safe-area inset to this component.
   *
   * Defaults to FALSE on purpose: every existing caller already wraps the
   * header in its own `<View style={{ paddingTop: insets.top }}>`, and
   * defaulting to true would inset those screens twice. New screens can set
   * this and drop the wrapper.
   */
  safeArea?: boolean;
  /**
   * The hairline bottom rule and opaque surface — the website's
   * `border-b border-slate-100 bg-white`. On by default: it is what separates
   * the header from content scrolling underneath it.
   */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function ScreenHeaderBase({
  title,
  subtitle,
  onBack,
  right,
  safeArea = false,
  bordered = true,
  style,
  testID,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        bordered && styles.bordered,
        safeArea && { paddingTop: insets.top },
        style,
      ]}
    >
      <View style={styles.row}>
        {onBack ? (
          <IconButton
            icon={<ArrowLeft size={18} strokeWidth={2.5} color={colors.textHeading} />}
            onPress={onBack}
            variant="surface"
            accessibilityLabel="Go back"
          />
        ) : null}

        {/* min-w-0 equivalent: without flexShrink a long title pushes `right`
            off the edge instead of truncating, which is how header actions
            disappear on a 360pt screen. */}
        <View style={styles.titles}>
          {title ? (
            <Text
              variant="bodyLarge"
              weight="bold"
              color={colors.textHeading}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="caption" numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

export const ScreenHeader = memo(ScreenHeaderBase);

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.surface,
  },
  bordered: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // `gap-3 px-4 py-3`, on the mobile gutter.
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    marginTop: 1,
  },
  right: {
    flexShrink: 0,
  },
});
