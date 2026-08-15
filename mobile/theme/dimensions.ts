/**
 * Layout dimensions and responsive helpers.
 * ----------------------------------------------------------------------------
 * Nothing here reads `Dimensions.get()` at module scope — that value is
 * captured once and goes stale on rotation or a foldable unfolding. Consumers
 * use `useLayout()`, which subscribes to changes.
 * ----------------------------------------------------------------------------
 */

import { useWindowDimensions } from 'react-native';

/** Breakpoints in dp. Small phones are the constraint we design against. */
export const breakpoints = {
  /** iPhone SE, small Androids. */
  small: 360,
  /** Standard phones. */
  medium: 400,
  /** Large phones / phablets. */
  large: 430,
  /** Tablets. */
  tablet: 768,
} as const;

/** Fixed component heights, kept consistent across screens. */
export const sizes = {
  headerHeight: 56,
  bottomNavHeight: 64,
  buttonHeight: 52,
  buttonHeightSmall: 40,
  inputHeight: 50,
  searchBarHeight: 48,
  avatarSmall: 32,
  avatarMedium: 44,
  avatarLarge: 64,
  iconButton: 44,
  /** Tracking-map viewport. Tall enough to be useful, short enough to leave
   *  the status sheet visible without scrolling on a small phone. */
  trackingMapHeight: 300,
  categoryTile: 84,
  serviceTile: 108,
} as const;

export interface LayoutInfo {
  width: number;
  height: number;
  isSmall: boolean;
  isTablet: boolean;
  /** Columns for the category grid — 4 on normal phones, 3 when cramped. */
  categoryColumns: number;
  /** Content width capped so a tablet doesn't stretch a single column. */
  contentWidth: number;
}

export function useLayout(): LayoutInfo {
  const { width, height } = useWindowDimensions();
  const isSmall = width < breakpoints.medium;
  const isTablet = width >= breakpoints.tablet;

  return {
    width,
    height,
    isSmall,
    isTablet,
    categoryColumns: isTablet ? 6 : isSmall ? 3 : 4,
    // Mirrors the website's tablet-landscape cap (index.css media query).
    contentWidth: isTablet ? Math.min(width, 640) : width,
  };
}
