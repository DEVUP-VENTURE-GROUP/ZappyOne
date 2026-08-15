/**
 * Empty / error / loading states.
 * ----------------------------------------------------------------------------
 * The requirement is "useful UI rather than blank screens". Every list and
 * detail screen uses these three so a failure never renders as nothing.
 *
 * `ErrorState` always offers a retry, and prefers the server's structured
 * error message over a generic string — the backend returns machine-readable
 * `code` plus a human `error`, and showing the real reason is far more useful
 * than "Something went wrong".
 * ----------------------------------------------------------------------------
 */

import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CloudOff, Inbox, RefreshCw, WifiOff } from 'lucide-react-native';
import { Button } from './Button';
import { Text, Heading } from './Text';
import { colors, slate } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

function EmptyStateBase({
  title,
  message,
  icon,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>
        {icon ?? <Inbox size={28} color={colors.textMuted} />}
      </View>
      <Heading level={3} align="center" style={styles.title}>
        {title}
      </Heading>
      {message ? (
        <Text variant="muted" align="center" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="outline"
          size="small"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

export const EmptyState = memo(EmptyStateBase);

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** True when the failure looks like a connectivity problem. */
  offline?: boolean;
  style?: StyleProp<ViewStyle>;
}

function ErrorStateBase({
  title,
  message,
  onRetry,
  offline = false,
  style,
}: ErrorStateProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconWrap, styles.iconWrapError]}>
        {offline ? (
          <WifiOff size={28} color={colors.error} />
        ) : (
          <CloudOff size={28} color={colors.error} />
        )}
      </View>
      <Heading level={3} align="center" style={styles.title}>
        {title ?? (offline ? 'No connection' : 'Something went wrong')}
      </Heading>
      <Text variant="muted" align="center" style={styles.message}>
        {message ??
          (offline
            ? 'Check your internet connection and try again.'
            : 'We could not load this right now.')}
      </Text>
      {onRetry ? (
        <Button
          label="Try again"
          onPress={onRetry}
          variant="outline"
          size="small"
          icon={<RefreshCw size={15} color={colors.primaryDark} />}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

export const ErrorState = memo(ErrorStateBase);

export interface LoadingStateProps {
  label?: string;
  style?: StyleProp<ViewStyle>;
}

function LoadingStateBase({ label, style }: LoadingStateProps) {
  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
    >
      <ActivityIndicator color={colors.primary} />
      {label ? (
        <Text variant="muted" align="center" style={styles.message}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export const LoadingState = memo(LoadingStateBase);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.large,
    backgroundColor: slate[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  iconWrapError: {
    backgroundColor: colors.errorTint,
  },
  title: {
    marginBottom: spacing.xs,
  },
  message: {
    marginTop: spacing.xs,
    maxWidth: 280,
  },
  action: {
    marginTop: spacing.lg,
  },
});
