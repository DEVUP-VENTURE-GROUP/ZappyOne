/**
 * What every helping booking shares (the websites' ShoppingTaskPage and
 * ReturnTaskPage): where from and to, the price, surge and tip, someone else
 * on site, the coverage check before booking, one idempotency key, and the
 * request itself. Each screen only adds its own fields to the body.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAppSelector } from '@zappy/core/store/hooks';
import { useCheckoutDraft } from '@zappy/core/shared/useCheckoutDraft';
import { useCreateHelpingTaskMutation, useHelpingQuoteMutation } from '@zappy/core/api';
import { doorAddress } from '@zappy/core/shared/doorAddress';
import { toast } from '@zappy/ui/components/Toast';
import { surgeChanged, useSurge } from '@zappy/ui/components/booking/SurgeLines';
import { usePickLocation, type BookingLocation } from '@zappy/ui/lib/bookingLocation';
import { useCoverageCheck } from '@zappy/ui/lib/coverageCheck';
import { errText } from '@zappy/ui/lib/feedback';

export interface HelpingCharge { baseFeePaise?: number; distanceFeePaise?: number; multiStopFeePaise?: number; specialHandlingPaise?: number; platformFeePaise?: number; discountPaise?: number; taxPaise?: number; serviceChargePaise: number }

const point = (l: BookingLocation) => ({ type: 'Point', coordinates: [l.lng, l.lat], address: doorAddress(l) });

export function useHelpingBooking({ serviceType, coverageLine }: { serviceType: string; coverageLine: string }) {
  const router = useRouter();
  const [pickup, setPickup] = useState<BookingLocation | null>(null);
  const [dest, setDest] = useState<BookingLocation | null>(null);
  const pickPickup = usePickLocation(setPickup);
  const pickDest = usePickLocation(setDest);
  const covered = useCoverageCheck();
  const [notHere, setNotHere] = useState(false);
  const [onSite, setOnSite] = useState<{ name: string; phone: string } | 'incomplete' | null>(null);
  const [tip, setTip] = useState(0);
  const idempotencyKey = useMemo(() => `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, []);
  const [getQuote, { data: quoteData, isLoading: quoting }] = useHelpingQuoteMutation();
  const [create, { isLoading: booking }] = useCreateHelpingTaskMutation();

  const charge: HelpingCharge | undefined = quoteData?.charge;
  // Priced and ready to request: home's "Continue your booking" and one reminder push (jobs/checkout-draft).
  const signedIn = useAppSelector((s) => s.auth.isAuthenticated);
  const isReturn = ['return', 'exchange'].includes(serviceType);
  const draftDone = useCheckoutDraft('helping', charge ? {
    title: isReturn ? 'Return or exchange' : serviceType === 'shopping' ? 'Shopping errand' : 'Pickup and drop',
    step: 'Confirm', path: isReturn ? '/helping/returns' : '/helping/shopping', pricePaise: charge.serviceChargePaise ?? null,
  } : null, signedIn);
  const surge = useSurge({
    kind: 'helping', line: serviceType, loc: pickup,
    basePaise: charge ? Math.max(0, (charge.serviceChargePaise || 0) - (charge.taxPaise || 0) - (charge.platformFeePaise || 0)) : null,
    skip: !charge,
  });

  async function quote(items: unknown[] = []) {
    if (!pickup) return;
    try { await getQuote({ serviceType, pickupLocation: point(pickup), destination: dest ? point(dest) : null, items }).unwrap(); }
    catch (err) { toast.error(errText(err, 'Could not price this yet. Try again.')); }
  }

  /** Request the helper with this screen's own fields; false when it did not go through. */
  async function book(fields: Record<string, unknown>) {
    if (!pickup) return false;
    if (!(await covered(coverageLine, pickup))) { setNotHere(true); return false; }
    if (onSite === 'incomplete') { toast.error('Add their name and mobile number, or untick "for someone else".'); return false; }
    try {
      const res = await create({
        ...(onSite && { onSite }), serviceType, pickupLocation: point(pickup), destination: dest ? point(dest) : undefined,
        ...fields, paymentMethod: 'cash', idempotencyKey, ...surge.bookingFields, ...(tip > 0 && { tipPaise: tip * 100 }),
      }).unwrap();
      toast.success('Task requested');
      draftDone();
      router.replace(`/helping/tasks/${res.task._id}` as never);
      return true;
    } catch (err) {
      if (surgeChanged(err, surge.refetch)) toast((err as { data: { error: string } }).data.error);
      else toast.error(errText(err, 'Could not create the task. Try again.'));
      return false;
    }
  }

  return {
    pickup, dest, pickPickup: () => pickPickup(pickup), pickDest: () => pickDest(dest || pickup),
    notHere, setNotHere, onSite, setOnSite, tip, setTip, charge, authorisationNote: quoteData?.authorisation?.note as string | undefined,
    surge, quote, quoting, book, booking,
  };
}
