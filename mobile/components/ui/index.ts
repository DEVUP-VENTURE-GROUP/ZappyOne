/**
 * Design-system barrel.
 * Screens import from here: `import { Button, Card, Text } from '@/components/ui'`.
 */

export { Text, Heading, SectionTitle } from './Text';
export type { TextProps, HeadingProps } from './Text';

export { ScalePressable } from './Pressable';
export type { ScalePressableProps } from './Pressable';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonVariant } from './IconButton';

export { Card } from './Card';
export type { CardProps, CardVariant } from './Card';

export { Gradient } from './Gradient';
export type { GradientProps } from './Gradient';

export { Input, SearchBar } from './Input';
export type { InputProps, SearchBarProps } from './Input';

export { Chip, Badge, StatusBadge, STATUS_LABEL } from './Chip';
export type { ChipProps, ChipTone, BadgeProps, StatusBadgeProps } from './Chip';

export { Skeleton, SkeletonCard, SkeletonList } from './Skeleton';
export type { SkeletonProps, SkeletonListProps } from './Skeleton';

export { EmptyState, ErrorState, LoadingState } from './States';
export type { EmptyStateProps, ErrorStateProps, LoadingStateProps } from './States';

export {
  Divider,
  Avatar,
  Rating,
  PriceRow,
  ScreenHeader,
  formatRupees,
} from './Misc';
export type {
  AvatarProps,
  RatingProps,
  PriceRowProps,
  ScreenHeaderProps,
} from './Misc';

export { BottomSheet } from './BottomSheet';
export type { BottomSheetProps } from './BottomSheet';

export { ZappyLogo } from './ZappyLogo';
export type { ZappyLogoProps } from './ZappyLogo';
