/** Pet care booking for one category (the website's PetBookingFlowPage): reads the draft saved on this phone, then runs the flow; "Start over" clears it. */
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { clearDraft, readDraft } from '@zappy/core/lib/drafts';
import { LoadingState } from '@zappy/ui/components';
import { PetBookingFlow, type PetDraft } from './booking/PetBookingFlow';

export function PetBookingFlowPage() {
  const { categoryCode } = useLocalSearchParams<{ categoryCode: string }>();
  const draftKey = `pet:${categoryCode}`;
  const [run, setRun] = useState(0);
  const [saved, setSaved] = useState<PetDraft | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    readDraft<PetDraft>(draftKey).then((d) => { if (live) setSaved(d); });
    return () => { live = false; };
  }, [draftKey]);

  if (saved === undefined) return <LoadingState />;
  return <PetBookingFlow key={`${categoryCode}-${run}`} categoryCode={categoryCode} saved={run ? null : saved} draftKey={draftKey} onStartOver={() => { clearDraft(draftKey); setRun((n) => n + 1); }} />;
}
