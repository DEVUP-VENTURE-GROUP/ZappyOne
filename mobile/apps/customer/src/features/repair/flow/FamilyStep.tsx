/**
 * The product line, e.g. ThinkPad (the website's FamilyStep); a brand with none catalogued moves straight on.
 */
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import { HelpCircle } from 'lucide-react-native';
import { useRepairFamiliesQuery } from '@zappy/core/api';
import { Text } from '@zappy/ui/components';
import { zappy } from '@zappy/ui/theme/colors';
import type { Coded } from './BrandStep';
import { Shell, Spinner, flow } from './FlowChrome';
import { ListRow } from './ListRow';

/** The product line; a brand with none catalogued moves straight on. */
export function FamilyStep({ vertical, brand, productType, onPick, onSkip }: { vertical: string; brand: Coded; productType: Coded | null; onPick: (f: Coded) => void; onSkip: () => void }) {
  const { data, isLoading } = useRepairFamiliesQuery({ vertical, brandCode: brand.code, productTypeCode: productType?.code });
  const families: Coded[] = data?.families || [];
  useEffect(() => { if (!isLoading && !families.length) onSkip(); }, [isLoading, families.length, onSkip]);
  if (isLoading || !families.length) return <Spinner />;
  return (
    <Shell>
      {families.map((f) => <ListRow key={f.code} title={f.name} body={f.description} onPress={() => onPick(f)} />)}
      <Pressable onPress={onSkip} style={flow.link}><HelpCircle size={15} color={zappy[600]} /><Text variant="bodySmall" weight="semibold" color={zappy[600]}>Not sure which line it is</Text></Pressable>
    </Shell>
  );
}
