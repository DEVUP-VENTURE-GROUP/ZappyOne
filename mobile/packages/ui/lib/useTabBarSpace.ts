// Bottom padding for a tab screen's scroll content: on iOS 26 the glass tab bar floats over it, elsewhere the bar sits below.
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LIQUID_GLASS } from '../components/Glass';
import { spacing } from '../theme/spacing';

export function useTabBarSpace(): number {
  const { bottom } = useSafeAreaInsets();
  return LIQUID_GLASS ? bottom + spacing.xxxl : spacing.xxxl;
}
