/**
 * Bottom sheet.
 * ----------------------------------------------------------------------------
 * The native translation of the website's desktop sidebars and modals, per the
 * brief's "desktop sidebar → bottom sheet" mapping.
 *
 * Built on the Modal + Reanimated + Gesture Handler already in the project
 * rather than pulling in a sheet library — the behaviour needed here (slide up,
 * drag to dismiss, backdrop tap) is small, and a new native dependency is not
 * permitted in Phase 5.
 *
 * Drag tracking runs entirely on the UI thread, so the sheet stays glued to the
 * finger even when the JS thread is busy loading data behind it.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useCallback, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heading } from './Text';
import { IconButton } from './IconButton';
import { X } from 'lucide-react-native';
import { colors, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { springSnap, timing } from '../../theme/animation';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Fraction of screen height the sheet occupies. Defaults to content-sized. */
  heightFraction?: number;
  showHandle?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Drag distance past which releasing dismisses the sheet. */
const DISMISS_THRESHOLD = 120;

function BottomSheetBase({
  visible,
  onClose,
  title,
  children,
  heightFraction,
  showHandle = true,
  style,
}: BottomSheetProps) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, springSnap);
      backdropOpacity.value = withTiming(1, timing.normal);
    } else {
      translateY.value = screenHeight;
      backdropOpacity.value = 0;
    }
  }, [visible, screenHeight, translateY, backdropOpacity]);

  const close = useCallback(() => {
    backdropOpacity.value = withTiming(0, timing.fast);
    translateY.value = withTiming(screenHeight, timing.fast, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }, [backdropOpacity, translateY, screenHeight, onClose]);

  const panGesture = Gesture.Pan()
    .onChange((event) => {
      // Downward only — dragging up shouldn't detach the sheet from the bottom.
      const next = translateY.value + event.changeY;
      translateY.value = Math.max(0, next);
    })
    .onEnd((event) => {
      const shouldDismiss =
        translateY.value > DISMISS_THRESHOLD || event.velocityY > 800;
      if (shouldDismiss) {
        backdropOpacity.value = withTiming(0, timing.fast);
        translateY.value = withTiming(screenHeight, timing.fast, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, springSnap);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Animated.View
            style={StyleSheet.absoluteFill}
            onTouchEnd={close}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.sheet,
              heightFraction
                ? { height: screenHeight * heightFraction }
                : { maxHeight: screenHeight * 0.9 },
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
              sheetStyle,
              style,
            ]}
          >
            {showHandle ? <View style={styles.handle} /> : null}

            {title ? (
              <View style={styles.header}>
                <Heading level={3} style={styles.headerTitle}>
                  {title}
                </Heading>
                <IconButton
                  icon={<X size={18} color={colors.textSecondary} />}
                  onPress={close}
                  variant="surface"
                  accessibilityLabel="Close"
                />
              </View>
            ) : null}

            <View style={styles.body}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

export const BottomSheet = memo(BottomSheetBase);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.extraLarge,
    borderTopRightRadius: radius.extraLarge,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: slate[300],
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    gap: spacing.md,
  },
  headerTitle: {
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    flexShrink: 1,
  },
});
