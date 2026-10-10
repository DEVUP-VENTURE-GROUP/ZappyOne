/** Pick the kind of work: every domain the server lists, with its picture. */
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useProviderDomainsQuery } from '@zappy/core/api';
import { LoadingState, Text } from '../../../components';
import { RIPPLE } from '../../../lib/feedback';
import { ink, slate } from '../../../theme/colors';
import { ServiceThumb, pictureOf } from './ServiceThumb';
import { ob } from './onboardingStyles';

export interface Domain { code: string; name: string; description?: string; imageUrl?: string }

export function DomainStep({ onPick }: { onPick: (d: Domain) => void }) {
  const { data, isLoading } = useProviderDomainsQuery();
  if (isLoading) return <LoadingState />;
  const domains: Domain[] = data?.domains || [];
  return (
    <View style={ob.shell}>
      <Text variant="caption" color={ink[500]} style={ob.label}>Choose the kind of work you do. You can add more later.</Text>
      {domains.map((d) => (
        <Pressable key={d.code} onPress={() => onPick(d)} android_ripple={RIPPLE} accessibilityRole="button" style={[ob.card, ob.row]}>
          <ServiceThumb src={pictureOf(null, d.code, d.imageUrl)} />
          <View style={ob.flex}>
            <Text variant="bodySmall" weight="bold">{d.name}</Text>
            {d.description ? <Text variant="caption" color={ink[500]}>{d.description}</Text> : null}
          </View>
          <ChevronRight size={16} color={slate[300]} />
        </Pressable>
      ))}
    </View>
  );
}
