import { Redirect, useLocalSearchParams } from 'expo-router';
import { useRepairVerticalsQuery } from '@zappy/core/api';
import { RepairFlowPage } from '../../src/features/repair/RepairFlowPage';

// /repair/<service>: any service the server books opens the same flow, so a line added in admin needs no app update.
export default function Screen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const { data, isLoading } = useRepairVerticalsQuery(undefined);
  const vertical = String(slug).replace(/-/g, '_');
  if (isLoading) return null;
  if (!data?.items?.some((i: { vertical: string; status: string }) => i.vertical === vertical && i.status === 'live')) return <Redirect href="/services" />;
  return <RepairFlowPage key={vertical} vertical={vertical} />;
}
