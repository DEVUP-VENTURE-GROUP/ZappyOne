/**
 * Auth form fields.
 * ----------------------------------------------------------------------------
 * `PhoneField` — the website's split control: a country segment, a hairline
 * divider, then the number. The border turns Zappy blue on focus, which is the
 * only state change; nothing jumps or resizes.
 *
 * `OtpBoxes` — six separate cells backed by ONE hidden TextInput.
 *
 * That single-input approach is deliberate. Six real inputs with focus handed
 * between them fight the platform: Android fires onChangeText per cell in an
 * order the JS thread doesn't control, autofill delivers the whole code to one
 * cell, and backspace on an empty cell has to be special-cased with
 * onKeyPress — which is exactly the class of bug that made the OTP screen
 * unreliable before. Here the cells are presentation only; the value is a
 * plain string, so SMS autofill, paste and backspace all behave normally.
 * ----------------------------------------------------------------------------
 */

import React, { memo, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import { Text } from '../ui';
import { colors, zappy } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// ── Phone ───────────────────────────────────────────────────────────────────

export interface PhoneFieldProps extends Omit<TextInputProps, 'style' | 'onChangeText'> {
  value: string;
  onChangeText: (next: string) => void;
  /** Shown in the leading segment. Dial code only — no flag emoji on Android. */
  dialCode?: string;
  error?: string | null;
}

export const PhoneField = memo(function PhoneField({
  value,
  onChangeText,
  dialCode = '+91',
  error,
  ...rest
}: PhoneFieldProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  return (
    <View>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={[
          styles.phoneWrap,
          focused ? styles.phoneWrapFocused : null,
          error ? styles.phoneWrapError : null,
        ]}
        accessibilityLabel="Phone number"
      >
        {/* The country segment is display-only: the API takes a bare national
            number and India is the only market, so a picker here would be a
            control that changes nothing. */}
        <View style={styles.dialSegment}>
          <Text variant="body" weight="semibold">
            {dialCode}
          </Text>
          <ChevronDown size={15} color={colors.textMuted} />
        </View>

        <View style={styles.divider} />

        <TextInput
          ref={inputRef}
          style={styles.phoneInput}
          placeholder="Enter your phone number"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={15}
          value={value}
          onChangeText={(next) => onChangeText(next.replace(/\D/g, ''))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxFontSizeMultiplier={1.3}
          {...rest}
        />
      </Pressable>

      {error ? (
        <Text variant="caption" color={colors.error} style={styles.fieldError}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

// ── OTP ─────────────────────────────────────────────────────────────────────

export interface OtpBoxesProps {
  value: string;
  onChangeText: (next: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
}

/** Blinking caret in the active cell. Static under reduced motion. */
function Caret() {
  const reducedMotion = useReducedMotion();
  const blink = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;
    blink.value = withRepeat(withTiming(0, { duration: 600 }), -1, true);
  }, [blink, reducedMotion]);

  const style = useAnimatedStyle(() => ({ opacity: blink.value }));
  return <Animated.View style={[styles.caret, style]} />;
}

export const OtpBoxes = memo(function OtpBoxes({
  value,
  onChangeText,
  length = 6,
  error,
  autoFocus,
}: OtpBoxesProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const digits = value.split('');

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={styles.otpRow}
      accessibilityLabel={`Verification code, ${value.length} of ${length} digits entered`}
    >
      {Array.from({ length }, (_, i) => {
        const char = digits[i];
        const isActive = focused && i === Math.min(value.length, length - 1);
        const filled = Boolean(char);
        return (
          <View
            key={i}
            style={[
              styles.otpBox,
              filled ? styles.otpBoxFilled : null,
              isActive ? styles.otpBoxActive : null,
              error ? styles.otpBoxError : null,
            ]}
          >
            {char ? (
              <Text variant="heading2">{char}</Text>
            ) : isActive ? (
              <Caret />
            ) : null}
          </View>
        );
      })}

      {/* One real input behind the cells — see the header for why. */}
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={(next) => onChangeText(next.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        caretHidden
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // ── Phone ────────────────────────────────────────────────────────────────
  phoneWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  phoneWrapFocused: { borderColor: colors.primary },
  phoneWrapError: { borderColor: colors.error },
  dialSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
  },
  divider: { width: StyleSheet.hairlineWidth, height: '60%', backgroundColor: colors.border },
  phoneInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.md,
    // react-native-web renders a browser focus ring on the inner input, which
    // shows up as a second, differently-coloured outline inside the wrapper's
    // own focus border. The wrapper is the focus indicator here.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
    fontFamily: typography.body.fontFamily,
    // 15 rather than 16: at 16 the placeholder clips on a 375pt screen once
    // the dial segment and divider have taken their share of the row.
    fontSize: 15,
    color: colors.textPrimary,
  },
  fieldError: { marginTop: spacing.xs },

  // ── OTP ──────────────────────────────────────────────────────────────────
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  otpBox: {
    flex: 1,
    aspectRatio: 0.92,
    maxWidth: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: { borderColor: zappy[300], backgroundColor: colors.primaryTint },
  otpBoxActive: { borderColor: colors.primary },
  otpBoxError: { borderColor: colors.error, backgroundColor: colors.errorTint },
  caret: { width: 2, height: 22, borderRadius: 1, backgroundColor: colors.primary },

  // Off-screen rather than opacity:0 — a zero-opacity input still takes taps
  // on web and would swallow presses meant for the cells.
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Keeps the native keyboard anchored without showing the raw text.
    color: 'transparent',
  },
});
