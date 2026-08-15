/**
 * Text input + search bar.
 * ----------------------------------------------------------------------------
 * `.input` on the website: 14px radius, slate-200 border, 15px medium text,
 * and a blue focus ring. `.input-label` is the small uppercase label above it.
 * ----------------------------------------------------------------------------
 */

import React, { forwardRef, memo, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import { Text } from './Text';
import { IconButton } from './IconButton';
import { colors, slate, zappy, danger } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { sizes } from '../../theme/dimensions';
import { fontFamily } from '../../theme/typography';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  helper?: string;
  /** Rendered inside the field, before the text. */
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  multilineHeight?: number;
}

export const Input = memo(
  forwardRef<TextInput, InputProps>(function InputBase(
    {
      label,
      error,
      helper,
      leadingIcon,
      trailingIcon,
      containerStyle,
      multiline,
      multilineHeight = 96,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const hasError = Boolean(error);

    return (
      <View style={containerStyle}>
        {label ? (
          <Text variant="label" style={styles.label}>
            {label}
          </Text>
        ) : null}

        <View
          style={[
            styles.field,
            multiline && { height: multilineHeight, alignItems: 'flex-start' },
            focused && styles.fieldFocused,
            hasError && styles.fieldError,
          ]}
        >
          {leadingIcon ? <View style={styles.leading}>{leadingIcon}</View> : null}
          <TextInput
            ref={ref}
            style={[styles.input, multiline && styles.inputMultiline]}
            placeholderTextColor={colors.textMuted}
            multiline={multiline}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            // Errors are announced, not just coloured.
            accessibilityState={{ disabled: rest.editable === false }}
            maxFontSizeMultiplier={1.3}
            {...rest}
          />
          {trailingIcon ? <View style={styles.trailing}>{trailingIcon}</View> : null}
        </View>

        {hasError ? (
          <Text variant="bodySmall" color={colors.error} style={styles.message} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : helper ? (
          <Text variant="bodySmall" style={styles.message}>
            {helper}
          </Text>
        ) : null}
      </View>
    );
  }),
);

export interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Pill search field — the shape used across the website's discovery surfaces. */
function SearchBarBase({
  value,
  onChangeText,
  placeholder = 'Search services',
  onSubmit,
  autoFocus,
  style,
  accessibilityLabel = 'Search services',
}: SearchBarProps) {
  return (
    <View style={[styles.search, style]}>
      <Search size={18} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        autoCorrect={false}
        accessibilityLabel={accessibilityLabel}
        maxFontSizeMultiplier={1.3}
      />
      {value.length > 0 ? (
        <IconButton
          icon={<X size={16} color={colors.textSecondary} />}
          onPress={() => onChangeText('')}
          variant="plain"
          accessibilityLabel="Clear search"
          style={styles.clear}
        />
      ) : null}
    </View>
  );
}

export const SearchBar = memo(SearchBarBase);

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.xs,
  },
  field: {
    minHeight: sizes.inputHeight,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  fieldFocused: {
    borderColor: zappy[600],
    // Approximates the web's `focus:ring-2 ring-zappy-600/20`.
    borderWidth: 2,
  },
  fieldError: {
    borderColor: danger[500],
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
  inputMultiline: {
    textAlignVertical: 'top',
    height: '100%',
  },
  leading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    marginTop: spacing.xs,
  },
  search: {
    height: sizes.searchBarHeight,
    borderRadius: radius.pill,
    backgroundColor: slate[100],
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.base,
    paddingRight: spacing.xs,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  clear: {
    width: 32,
    height: 32,
  },
});
