/**
 * A shop's opening hours, in the setup flow rather than buried in a profile:
 * a shop with no stated hours is invisible to a customer deciding whether to
 * go, and takes bookings for times nobody is there. Saved as they change, so
 * stepping back and forth never loses an edit. Shops only.
 */
import { useEffect, useRef, useState } from 'react';
import { useUpdateShopMeMutation } from '@zappy/core/api';
import { DEFAULT_SHOP_HOURS, incompleteDay } from '@zappy/core/shared/weeklyHoursRules';
import { Text } from '../../../components';
import { toast } from '../../../components/Toast';
import { WeeklyHours, type DayHours } from '../../../components/provider/WeeklyHours';
import { errText } from '../../../lib/feedback';
import { ink } from '../../../theme/colors';
import { StepShell } from './StepShell';

export function HoursStep({ profile, onBack, onNext }: { profile?: { hours?: DayHours[] }; onBack: () => void; onNext: () => void }) {
  const [update, { isLoading }] = useUpdateShopMeMutation();
  const [hours, setHours] = useState<DayHours[]>(() => (profile?.hours?.length ? profile.hours : DEFAULT_SHOP_HOURS));
  const saved = useRef(JSON.stringify(hours));
  const [status, setStatus] = useState<'' | 'saving' | 'saved'>('');
  const current = JSON.stringify(hours);

  async function persist(): Promise<boolean> {
    if (current === saved.current || incompleteDay(hours)) return true;
    setStatus('saving');
    try { await update({ hours }).unwrap(); saved.current = current; setStatus('saved'); return true; }
    catch (err) { setStatus(''); toast.error(errText(err, 'Could not save your timings')); return false; }
  }

  // Saved a moment after each change.
  useEffect(() => {
    if (current === saved.current) return undefined;
    const t = setTimeout(persist, 900);
    return () => clearTimeout(t);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  async function next() {
    // An open day with no times is a promise nobody can keep.
    const bad = incompleteDay(hours);
    if (bad) { toast.error(`Set opening and closing times for ${bad}`); return; }
    if (await persist()) onNext();
  }

  return (
    <StepShell title="When are you open?" hint="Customers see this before booking. A day left closed takes no bookings."
      onBack={async () => { await persist(); onBack(); }} onNext={next} busy={isLoading}>
      <WeeklyHours hours={hours} onChange={setHours} />
      {status ? <Text variant="caption" weight="semibold" color={ink[500]}>{status === 'saving' ? 'Saving…' : 'Saved'}</Text> : null}
    </StepShell>
  );
}
