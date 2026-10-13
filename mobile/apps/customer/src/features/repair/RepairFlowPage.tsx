/**
 * The repair booking for one vertical (the website's RepairFlowPage): reads
 * the draft saved on this phone, then runs the flow on it. A problem picked
 * from a home chip, or a rebook, is a fresh start rather than a resume.
 * "Start over" clears the draft and remounts the flow.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { clearDraft, readDraft } from '@zappy/core/lib/drafts';
import { useClearCheckoutDraftMutation } from '@zappy/core/api';
import { LoadingState } from '@zappy/ui/components';
import { RepairFlow, type RepairDraft } from './RepairFlow';

export function RepairFlowPage({ vertical = 'mobile' }: { vertical?: string }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ problem?: string; brand?: string }>();
  const draftKey = `repair:${vertical}`;
  const fresh = !!(params.problem || params.brand);
  const [run, setRun] = useState(0);
  const [clearServerDraft] = useClearCheckoutDraftMutation();
  const [saved, setSaved] = useState<RepairDraft | null | undefined>(fresh ? null : undefined);

  useEffect(() => {
    if (fresh) return undefined;
    let live = true;
    readDraft<RepairDraft>(draftKey).then((d) => { if (live) setSaved(d); });
    return () => { live = false; };
  }, [draftKey, fresh]);

  if (saved === undefined) return <View style={{ flex: 1 }}><LoadingState /></View>;
  return (
    <RepairFlow key={`${vertical}-${run}`} vertical={vertical} saved={run ? null : saved} draftKey={draftKey}
      onStartOver={() => { clearDraft(draftKey); clearServerDraft('repair').catch(() => {}); router.setParams({ problem: undefined, brand: undefined, model: undefined }); setRun((n) => n + 1); }} />
  );
}
