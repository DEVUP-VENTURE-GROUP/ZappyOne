/**
 * A tappable row with a title and a line under it, for the step lists.
 */
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Text } from '@zappy/ui/components';
import { RIPPLE } from '@zappy/ui/lib/feedback';
import { ink, slate } from '@zappy/ui/theme/colors';
import { flow } from './FlowChrome';

export function ListRow({ title, body, onPress }: { title: string; body?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} android_ripple={RIPPLE} accessibilityRole="button" style={[flow.card, flow.row]}>
      <View style={flow.flex}><Text variant="bodySmall" weight="semibold">{title}</Text>{body ? <Text variant="caption" color={ink[400]}>{body}</Text> : null}</View>
      <ChevronRight size={16} color={slate[300]} />
    </Pressable>
  );
}
