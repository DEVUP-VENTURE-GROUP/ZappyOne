/**
 * Short messages at the bottom of the screen — the app's version of the
 * websites' toasts, with the same calls (`toast()`, `toast.success()`,
 * `toast.error()`), so ported screens say the same thing the same way.
 *
 * Mounted once by AppRoot (<ToastHost />). A message with an `id` replaces an
 * earlier one with the same id instead of stacking. `action` adds one button,
 * e.g. Undo, that runs and closes the message.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react-native';
import { Text } from './Text';
import { colors, ink } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

type Tone = 'info' | 'success' | 'error';
interface ToastAction { label: string; onPress: () => void }
interface ToastOptions { id?: string; duration?: number; action?: ToastAction }
interface ToastItem { key: string; message: string; tone: Tone; duration: number; action?: ToastAction }

const listeners = new Set<(t: ToastItem) => void>();
let seq = 0;

function emit(message: string, tone: Tone, opts: ToastOptions = {}) {
  const item = { key: opts.id || `t${++seq}`, message, tone, action: opts.action, duration: opts.duration ?? (opts.action ? 6000 : tone === 'error' ? 5000 : 3500) };
  listeners.forEach((l) => l(item));
}

export const toast = Object.assign((message: string, opts?: ToastOptions) => emit(message, 'info', opts), {
  success: (message: string, opts?: ToastOptions) => emit(message, 'success', opts),
  error: (message: string, opts?: ToastOptions) => emit(message, 'error', opts),
});

const ICON = { info: Info, success: CheckCircle2, error: AlertCircle };
const ICON_COLOR = { info: colors.textInverse, success: '#4ADE80', error: '#F87171' };

/** Mount once near the root. `bottomOffset` lifts it above a tab bar. */
export function ToastHost({ bottomOffset = 72 }: { bottomOffset?: number }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setItems((list) => [...list.filter((x) => x.key !== t.key), t].slice(-3));
      setTimeout(() => setItems((list) => list.filter((x) => x !== t)), t.duration);
    };
    listeners.add(onToast);
    return () => { listeners.delete(onToast); };
  }, []);

  if (!items.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + bottomOffset }]}>
      {items.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <Animated.View key={t.key} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(150)}>
            <Pressable
              onPress={() => setItems((list) => list.filter((x) => x !== t))}
              accessibilityRole="alert"
              accessibilityLabel={t.message}
              style={styles.toast}
            >
              <Icon size={18} color={ICON_COLOR[t.tone]} />
              <Text variant="bodySmall" weight="medium" color={colors.textInverse} style={styles.text}>{t.message}</Text>
              {t.action ? (
                <Pressable onPress={() => { setItems((list) => list.filter((x) => x !== t)); t.action!.onPress(); }} hitSlop={8} accessibilityRole="button">
                  <Text variant="bodySmall" weight="bold" color="#93C5FD">{t.action.label}</Text>
                </Pressable>
              ) : null}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.base, right: spacing.base, gap: spacing.sm, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: 520,
    backgroundColor: ink[900], borderRadius: radius.button, paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  text: { flexShrink: 1 },
});
