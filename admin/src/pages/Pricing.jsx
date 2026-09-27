import { useState, useEffect } from 'react';
import {
  useGetPricingConfigQuery,
  useAdminUpdatePricingMutation,
  useAdminTogglesMutation,
  useAdminToggleDispatchMutation,
} from '@client/services/api';
import { SectionHeader, Card, FormRow, Input, SaveBtn, PageLoader } from './_shared';
import toast from 'react-hot-toast';

function Toggle({ value, onChange, label }) {
  return (
    <div className="flex items-center gap-3 mt-1">
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex w-11 h-6 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-slate-200'}`}
      >
        <span
          className="inline-block w-5 h-5 rounded-full bg-white shadow transition-transform mt-0.5"
          style={{ transform: value ? 'translateX(22px)' : 'translateX(2px)' }}
        />
      </button>
      <span className="text-sm font-medium text-slate-700">{label || (value ? 'Enabled' : 'Disabled')}</span>
    </div>
  );
}

export default function Pricing() {
  // Correct endpoint: public GET /pricing → returns { pricing: { baseFeePaise, ... } }
  const { data, isLoading } = useGetPricingConfigQuery();
  // Correct endpoint: PATCH /api/${slug}/pricing → pricingService.updateActiveConfig (persists to Mongo + busts cache)
  const [updatePricing, { isLoading: saving }] = useAdminUpdatePricingMutation();
  // Correct endpoint: PATCH /api/${slug}/toggles → pricingService.updateActiveConfig
  const [setToggles, { isLoading: savingToggles }] = useAdminTogglesMutation();
  const [toggleDispatchMutation, { isLoading: togglingDispatch }] = useAdminToggleDispatchMutation();

  // Display in rupees; save as paise
  const [form, setForm] = useState({
    baseFee: 35, perKmFee: 12, perMinFee: 2, platformFee: 15, minFare: 60, surgeMaxMultiplier: 2.5,
  });
  const [toggles, setTogglesState] = useState({
    surgeEnabled: true, surgeMaxCap: 2.5, commissionRate: 0.30, couponCommissionRate: 0.15,
  });
  const [dispatchEnabled, setDispatchEnabled] = useState(true);
  const [dispatchConfirm, setDispatchConfirm] = useState(false);
  const [dispatch, setDispatch] = useState({
    forceAssignBonusRs: 15,
    workerAutoOfflineRejectRate: 70,
    workerRejectWarnRate: 50,
    rejectRatePenaltyWeight: 3.0,
    cancelRatePenaltyWeight: 5.0,
    minWorkerRating: 3.0,
  });
  const [accept, setAccept] = useState({
    forceAssignEnabled: false,
    geoReadinessEnabled: true,
    geoReadinessKm: 25,
    urgencyBonusEnabled: true,
    urgencyBonusStartStep: 4,
    urgencyBonusStepRs: 5,
    urgencyBonusMaxRs: 30,
    bestFirstEnabled: true,
    bestFirstWindowSec: 8,
    bestFirstTopN: 1,
  });
  const [zw, setZw] = useState({
    readyPoolEnabled: true,
    readyMaxMinutes: 20,
    readyDefaultRadiusKm: 5,
    readyBonusRs: 20,
    readyMinRating: 4.0,
    readyMinCompletedJobs: 5,
    readyCancelBanHours: 24,
    tierBonusMultiplierExpress: 2.0,
    tierBonusMultiplierPriority: 1.5,
    warmDispatchEnabled: true,
    positioningEnabled: true,
    positioningBonusRs: 30,
    positioningMinGap: 2,
  });
  const [stale, setStale] = useState({
    staleNudgeMinutes: 5,
    staleRedispatchMinutes: 10,
    staleOtwAlertMinutes: 20,
  });
  const [tips, setTips] = useState({
    tipMaxRs: 500,
    tipOptions: '20,50,100',
  });
  const [referral, setReferral] = useState({
    referralReferrerBonusRs: 150,
    referralRefereeBonusRs: 50,
  });
  const [boost, setBoost] = useState({
    boostEnabled: true,
    boostMaxRs: 200,
    boostOptions: '10,20,30,50,100',
    boostDispatchWeight: 1.5,
  });
  const [wallet, setWallet] = useState({
    earnedWageAdvanceEnabled: true,
    earnedWageAdvanceRate: 80,
    emergencyFundContributionRate: 0.5,
  });
  const [penalty, setPenalty] = useState({
    lateArrivalPenaltyRsPerMin: 2,
    lateArrivalGraceMinutes: 5,
  });
  const [tiers, setTiers] = useState({
    tierMultiplierPriority:  1.2,
    tierMultiplierExpress:   1.4,
    tierExpressMaxSearchSec:  60,
    tierPriorityMaxSearchSec: 120,
  });
  const [autoPricing, setAutoPricing] = useState({
    nightSurchargeEnabled: false,
    nightSurchargeMultiplier: 1.3,
    nightStartHour: 22,
    nightEndHour: 6,
    rainSurchargeEnabled: false,
    rainSurchargeMultiplier: 1.2,
    rainActiveUntil: null,
    weekendSurchargeEnabled: false,
    weekendSurchargeMultiplier: 1.1,
    peakHourSurchargeEnabled: false,
    peakHourRanges: [],
    surgeTolerancePct: 10,
  });
  const [rainDurationHours, setRainDurationHours] = useState(2);

  useEffect(() => {
    const p = data?.pricing;
    if (!p) return;
    setForm({
      baseFee:            (p.baseFeePaise    ?? 3500)  / 100,
      perKmFee:           (p.perKmFeePaise   ?? 1200)  / 100,
      perMinFee:          (p.perMinFeePaise  ?? 200)   / 100,
      platformFee:        (p.platformFeePaise ?? 1500) / 100,
      minFare:            (p.minFarePaise    ?? 6000)  / 100,
      surgeMaxMultiplier: p.surgeMaxCap ?? 2.5,
    });
    setTogglesState({
      surgeEnabled:         p.surgeEnabled         ?? true,
      surgeMaxCap:          p.surgeMaxCap          ?? 2.5,
      commissionRate:       p.commissionRate       ?? 0.30,
      couponCommissionRate: p.couponCommissionRate ?? 0.15,
    });
    setDispatchEnabled(p.dispatchEnabled ?? true);
    setDispatch({
      forceAssignBonusRs:          (p.forceAssignBonusPaise       ?? 1500) / 100,
      workerAutoOfflineRejectRate:  Math.round((p.workerAutoOfflineRejectRate ?? 0.70) * 100),
      workerRejectWarnRate:         Math.round((p.workerRejectWarnRate        ?? 0.50) * 100),
      rejectRatePenaltyWeight:      p.rejectRatePenaltyWeight ?? 3.0,
      cancelRatePenaltyWeight:      p.cancelRatePenaltyWeight ?? 5.0,
      minWorkerRating:              p.minWorkerRating          ?? 3.0,
    });
    setAccept({
      forceAssignEnabled:    p.forceAssignEnabled    ?? false,
      // null on the server = "defer to env"; surface that as ON (prod default).
      geoReadinessEnabled:   p.geoReadinessEnabled   ?? true,
      geoReadinessKm:        p.geoReadinessKm        ?? 25,
      urgencyBonusEnabled:   p.urgencyBonusEnabled   ?? true,
      urgencyBonusStartStep: p.urgencyBonusStartStep ?? 4,
      urgencyBonusStepRs:    (p.urgencyBonusStepPaise ?? 500) / 100,
      urgencyBonusMaxRs:     (p.urgencyBonusMaxPaise  ?? 3000) / 100,
      bestFirstEnabled:      p.bestFirstEnabled       ?? true,
      bestFirstWindowSec:    (p.bestFirstWindowMs     ?? 8000) / 1000,
      bestFirstTopN:         p.bestFirstTopN          ?? 1,
    });
    setZw({
      readyPoolEnabled:            p.readyPoolEnabled            ?? true,
      readyMaxMinutes:             p.readyMaxMinutes             ?? 20,
      readyDefaultRadiusKm:        p.readyDefaultRadiusKm        ?? 5,
      readyBonusRs:                (p.readyBonusPaise            ?? 2000) / 100,
      readyMinRating:              p.readyMinRating              ?? 4.0,
      readyMinCompletedJobs:       p.readyMinCompletedJobs       ?? 5,
      readyCancelBanHours:         p.readyCancelBanHours         ?? 24,
      tierBonusMultiplierExpress:  p.tierBonusMultiplierExpress  ?? 2.0,
      tierBonusMultiplierPriority: p.tierBonusMultiplierPriority ?? 1.5,
      warmDispatchEnabled:         p.warmDispatchEnabled         ?? true,
      positioningEnabled:          p.positioningEnabled          ?? true,
      positioningBonusRs:          (p.positioningBonusPaise      ?? 3000) / 100,
      positioningMinGap:           p.positioningMinGap           ?? 2,
    });
    setStale({
      staleNudgeMinutes:       p.staleNudgeMinutes       ?? 5,
      staleRedispatchMinutes:  p.staleRedispatchMinutes  ?? 10,
      staleOtwAlertMinutes:    p.staleOtwAlertMinutes    ?? 20,
    });
    setTips({
      tipMaxRs:    (p.tipMaxPaise ?? 50000) / 100,
      tipOptions:  (p.tipOptions  ?? [20, 50, 100]).join(','),
    });
    setBoost({
      boostEnabled:        p.boostEnabled        ?? true,
      boostMaxRs:          (p.boostMaxPaise       ?? 20000) / 100,
      boostOptions:        (p.boostOptions        ?? [10, 20, 30, 50, 100]).join(','),
      boostDispatchWeight: p.boostDispatchWeight  ?? 1.5,
    });
    setReferral({
      referralReferrerBonusRs: (p.referralReferrerBonusPaise ?? 15000) / 100,
      referralRefereeBonusRs:  (p.referralRefereeBonusPaise  ?? 5000)  / 100,
    });
    setWallet({
      earnedWageAdvanceEnabled:      p.earnedWageAdvanceEnabled      ?? true,
      earnedWageAdvanceRate:         Math.round((p.earnedWageAdvanceRate ?? 0.80) * 100),
      emergencyFundContributionRate: Math.round((p.emergencyFundContributionRate ?? 0.005) * 1000) / 10,
    });
    setPenalty({
      lateArrivalPenaltyRsPerMin: Math.round((p.lateArrivalPenaltyPaisePerMin ?? 200) / 100),
      lateArrivalGraceMinutes:    p.lateArrivalGraceMinutes ?? 2,
    });
    setTiers({
      tierMultiplierPriority:  p.tierMultiplierPriority  ?? 1.2,
      tierMultiplierExpress:   p.tierMultiplierExpress   ?? 1.4,
      tierExpressMaxSearchSec:  Math.round((p.tierExpressMaxSearchMs  ?? 60000)  / 1000),
      tierPriorityMaxSearchSec: Math.round((p.tierPriorityMaxSearchMs ?? 120000) / 1000),
    });
    setAutoPricing({
      nightSurchargeEnabled:    p.nightSurchargeEnabled    ?? false,
      nightSurchargeMultiplier: p.nightSurchargeMultiplier ?? 1.3,
      nightStartHour:           p.nightStartHour           ?? 22,
      nightEndHour:             p.nightEndHour             ?? 6,
      rainSurchargeEnabled:     p.rainSurchargeEnabled     ?? false,
      rainSurchargeMultiplier:  p.rainSurchargeMultiplier  ?? 1.2,
      rainActiveUntil:          p.rainActiveUntil           ?? null,
      weekendSurchargeEnabled:    p.weekendSurchargeEnabled    ?? false,
      weekendSurchargeMultiplier: p.weekendSurchargeMultiplier ?? 1.1,
      peakHourSurchargeEnabled: p.peakHourSurchargeEnabled ?? false,
      peakHourRanges:           p.peakHourRanges           ?? [],
      surgeTolerancePct:        Math.round((p.surgeTolerancePct ?? 0.10) * 100),
    });
  }, [data]);

  const field = (key) => ({
    type: 'number', value: form[key] ?? '',
    onChange: (e) => setForm(prev => ({ ...prev, [key]: Number(e.target.value) })),
  });

  async function saveSection(patch) {
    try {
      await updatePricing(patch).unwrap();
      toast.success('Saved');
    } catch (err) {
      toast.error(err?.data?.error || 'Save failed');
    }
  }

  async function savePricing() {
    try {
      await updatePricing({
        baseFeePaise:    Math.round(form.baseFee    * 100),
        perKmFeePaise:   Math.round(form.perKmFee   * 100),
        perMinFeePaise:  Math.round(form.perMinFee  * 100),
        platformFeePaise: Math.round(form.platformFee * 100),
        minFarePaise:    Math.round(form.minFare    * 100),
        surgeMaxCap:     form.surgeMaxMultiplier,
      }).unwrap();
      toast.success('Pricing config saved');
    } catch (err) {
      toast.error(err?.data?.error || 'Save failed');
    }
  }

  async function saveToggles() {
    try {
      await setToggles({
        surgeEnabled:         toggles.surgeEnabled,
        surgeMaxCap:          toggles.surgeMaxCap,
        commissionRate:       toggles.commissionRate,
        couponCommissionRate: toggles.couponCommissionRate,
      }).unwrap();
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err?.data?.error || 'Save failed');
    }
  }

  const df = (key) => ({ type: 'number', value: dispatch[key] ?? '', onChange: (e) => setDispatch(p => ({ ...p, [key]: Number(e.target.value) })) });
  const af = (key) => ({ type: 'number', value: accept[key] ?? '', onChange: (e) => setAccept(p => ({ ...p, [key]: Number(e.target.value) })) });
  const zf = (key) => ({ type: 'number', value: zw[key] ?? '', onChange: (e) => setZw(p => ({ ...p, [key]: Number(e.target.value) })) });
  const sf = (key) => ({ type: 'number', value: stale[key] ?? '', onChange: (e) => setStale(p => ({ ...p, [key]: Number(e.target.value) })) });

  const isRainActive = autoPricing.rainActiveUntil && new Date(autoPricing.rainActiveUntil) > new Date();
  const rainExpiresIn = isRainActive
    ? Math.max(0, Math.round((new Date(autoPricing.rainActiveUntil) - Date.now()) / 60000))
    : 0;

  async function saveAutoPricing() {
    await saveSection({
      nightSurchargeEnabled:    autoPricing.nightSurchargeEnabled,
      nightSurchargeMultiplier: autoPricing.nightSurchargeMultiplier,
      nightStartHour:           autoPricing.nightStartHour,
      nightEndHour:             autoPricing.nightEndHour,
      rainSurchargeEnabled:     autoPricing.rainSurchargeEnabled,
      rainSurchargeMultiplier:  autoPricing.rainSurchargeMultiplier,
      weekendSurchargeEnabled:    autoPricing.weekendSurchargeEnabled,
      weekendSurchargeMultiplier: autoPricing.weekendSurchargeMultiplier,
      peakHourSurchargeEnabled: autoPricing.peakHourSurchargeEnabled,
      peakHourRanges:           autoPricing.peakHourRanges,
      surgeTolerancePct:        autoPricing.surgeTolerancePct / 100,
    });
  }

  async function toggleRainMode() {
    const newUntil = isRainActive
      ? null
      : new Date(Date.now() + rainDurationHours * 3600000).toISOString();
    await saveSection({ rainActiveUntil: newUntil });
    setAutoPricing(p => ({ ...p, rainActiveUntil: newUntil }));
  }

  function addPeakRange() {
    setAutoPricing(p => ({
      ...p,
      peakHourRanges: [...p.peakHourRanges, { label: 'Rush Hour', startHour: 8, endHour: 11, multiplier: 1.2 }],
    }));
  }

  function removePeakRange(idx) {
    setAutoPricing(p => ({ ...p, peakHourRanges: p.peakHourRanges.filter((_, i) => i !== idx) }));
  }

  function updatePeakRange(idx, key, value) {
    setAutoPricing(p => ({
      ...p,
      peakHourRanges: p.peakHourRanges.map((r, i) => i === idx ? { ...r, [key]: value } : r),
    }));
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6 p-6">
      <SectionHeader title="Platform Control Centre" subtitle="All pricing, bonuses, thresholds, and behaviour — controlled from here. Changes apply instantly." />

      {/* ── Base Fare ── */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Fare Components</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormRow label="Base Fee (₹)" hint="Flat charge for every order"><Input {...field('baseFee')} step="1" min="0" /></FormRow>
          <FormRow label="Per KM Fee (₹)" hint="Charged per kilometre"><Input {...field('perKmFee')} step="0.5" min="0" /></FormRow>
          <FormRow label="Per Minute Fee (₹)" hint="Charged per minute"><Input {...field('perMinFee')} step="0.5" min="0" /></FormRow>
          <FormRow label="Platform Fee (₹)" hint="Fixed platform service charge"><Input {...field('platformFee')} step="1" min="0" /></FormRow>
          <FormRow label="Min Fare (₹)" hint="Minimum chargeable fare"><Input {...field('minFare')} step="5" min="0" /></FormRow>
          <FormRow label="Surge Max Multiplier" hint="e.g. 2.5 = max 2.5×"><Input {...field('surgeMaxMultiplier')} step="0.1" min="1" max="10" /></FormRow>
        </div>
        <div className="mt-5"><SaveBtn loading={saving} onClick={savePricing} /></div>
      </Card>

      {/* ── Surge + Commission ── */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Surge &amp; Commission</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <FormRow label="Surge Pricing" hint="Toggle surge on/off platform-wide">
            <Toggle value={toggles.surgeEnabled} onChange={(v) => setTogglesState(p => ({ ...p, surgeEnabled: v }))} />
          </FormRow>
          <FormRow label="Surge Cap" hint="Maximum surge multiplier (1–5)">
            <Input type="number" value={toggles.surgeMaxCap} min="1" max="5" step="0.1"
              onChange={(e) => setTogglesState(p => ({ ...p, surgeMaxCap: Number(e.target.value) }))} />
          </FormRow>
          <FormRow label="Standard Commission Rate" hint="Platform cut on regular orders — 0 to 50%">
            <div className="flex items-center gap-2">
              <Input type="number" value={toggles.commissionRate} min="0" max="0.5" step="0.01"
                onChange={(e) => setTogglesState(p => ({ ...p, commissionRate: Number(e.target.value) }))} />
              <span className="text-base font-bold text-slate-700 w-12 shrink-0">{(toggles.commissionRate * 100).toFixed(0)}%</span>
            </div>
          </FormRow>
          <FormRow label="Coupon Order Commission" hint="Lower cut when customer used a promo code — worker keeps more">
            <div className="flex items-center gap-2">
              <Input type="number" value={toggles.couponCommissionRate} min="0" max="0.5" step="0.01"
                onChange={(e) => setTogglesState(p => ({ ...p, couponCommissionRate: Number(e.target.value) }))} />
              <span className="text-base font-bold text-slate-700 w-12 shrink-0">{(toggles.couponCommissionRate * 100).toFixed(0)}%</span>
            </div>
          </FormRow>
        </div>
        <div className="mt-5"><SaveBtn loading={savingToggles} onClick={saveToggles} /></div>
      </Card>

      {/* ── Dispatch Kill-Switch ── */}
      <Card className={`p-6 ${!dispatchEnabled ? 'ring-2 ring-red-300 bg-red-50' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-700">Dispatch Engine</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {dispatchEnabled
                ? 'Active — new orders are being dispatched to workers normally.'
                : '⚠️ PAUSED — all new dispatch jobs re-queue every 60 s. Orders will not be assigned until re-enabled.'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {!dispatchConfirm ? (
              <button
                onClick={() => setDispatchConfirm(true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  dispatchEnabled
                    ? 'bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-200'
                    : 'bg-green-50 text-green-700 hover:bg-green-100 ring-1 ring-green-200'
                }`}
              >
                {dispatchEnabled ? 'Pause Dispatch' : 'Resume Dispatch'}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 font-medium">
                  {dispatchEnabled ? 'Pause dispatch?' : 'Resume dispatch?'}
                </span>
                <button
                  disabled={togglingDispatch}
                  onClick={async () => {
                    try {
                      const next = !dispatchEnabled;
                      const res = await toggleDispatchMutation({ dispatchEnabled: next }).unwrap();
                      setDispatchEnabled(next);
                      setDispatchConfirm(false);
                      toast[next ? 'success' : 'error'](res.message, { duration: 6000 });
                    } catch { toast.error('Failed to toggle dispatch'); setDispatchConfirm(false); }
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-800 text-white rounded-lg disabled:opacity-50"
                >
                  {togglingDispatch ? '…' : 'Confirm'}
                </button>
                <button onClick={() => setDispatchConfirm(false)} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── Dispatch & Worker Behaviour ── */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Dispatch &amp; Worker Behaviour</h3>
        <p className="text-xs text-slate-400 mb-4">Controls auto-assign bonus, reject-rate penalties, and quality thresholds.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormRow label="Force-Assign Bonus (₹)" hint="Credited to worker when auto-assigned">
            <Input {...df('forceAssignBonusRs')} step="5" min="0" />
          </FormRow>
          <FormRow label="Auto-Offline Reject Rate (%)" hint="Worker taken offline above this ignore rate">
            <Input {...df('workerAutoOfflineRejectRate')} step="5" min="10" max="100" />
          </FormRow>
          <FormRow label="Reject Rate Warning (%)" hint="Early warning nudge threshold">
            <Input {...df('workerRejectWarnRate')} step="5" min="10" max="100" />
          </FormRow>
          <FormRow label="Reject Rate Penalty Weight" hint="Higher = chronic ignorers ranked worse">
            <Input {...df('rejectRatePenaltyWeight')} step="0.5" min="0" max="20" />
          </FormRow>
          <FormRow label="Cancel Rate Penalty Weight" hint="Higher = chronic cancellers ranked worse">
            <Input {...df('cancelRatePenaltyWeight')} step="0.5" min="0" max="20" />
          </FormRow>
          <FormRow label="Min Worker Rating" hint="Workers below this are excluded from dispatch">
            <Input {...df('minWorkerRating')} step="0.1" min="1" max="5" />
          </FormRow>
        </div>
        <div className="mt-5">
          <SaveBtn loading={saving} onClick={() => saveSection({
            forceAssignBonusPaise:       Math.round(dispatch.forceAssignBonusRs * 100),
            workerAutoOfflineRejectRate: dispatch.workerAutoOfflineRejectRate / 100,
            workerRejectWarnRate:        dispatch.workerRejectWarnRate / 100,
            rejectRatePenaltyWeight:     dispatch.rejectRatePenaltyWeight,
            cancelRatePenaltyWeight:     dispatch.cancelRatePenaltyWeight,
            minWorkerRating:             dispatch.minWorkerRating,
          })} />
        </div>
      </Card>

      {/* ── Acceptance-First Dispatch ── */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Acceptance-First Dispatch</h3>
        <p className="text-xs text-slate-400 mb-4">Assign by voluntary acceptance: the best-ranked pro gets first dibs, a growing bonus incentivises workers to opt in, and no one is force-assigned unless you switch it on. If nobody accepts, the customer is refunded — never forced onto a reluctant worker.</p>
        <div className="space-y-3 mb-4">
          <FormRow label="Best-Pro Head-Start" hint="Give the top-ranked pro a short exclusive window before broadcasting to everyone">
            <Toggle value={accept.bestFirstEnabled} onChange={(v) => setAccept(p => ({ ...p, bestFirstEnabled: v }))} />
          </FormRow>
          <FormRow label="High-Demand Accept Bonus" hint="Platform-funded bonus that grows as the search widens — paid to the worker on completion">
            <Toggle value={accept.urgencyBonusEnabled} onChange={(v) => setAccept(p => ({ ...p, urgencyBonusEnabled: v }))} />
          </FormRow>
          <FormRow label="Force-Assign (last resort)" hint="OFF = never force a non-consenting worker; a failed match refunds the customer instead">
            <Toggle value={accept.forceAssignEnabled} onChange={(v) => setAccept(p => ({ ...p, forceAssignEnabled: v }))} />
          </FormRow>
          <FormRow
            label="Supply Guard (reject if no worker in range)"
            hint="ON = reject the booking instantly when no skilled worker is within the radius below. Turn OFF if thin supply starts rejecting real customers."
          >
            <Toggle value={!!accept.geoReadinessEnabled} onChange={(v) => setAccept(p => ({ ...p, geoReadinessEnabled: v }))} />
          </FormRow>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <FormRow label="Supply Guard radius (km)" hint="How far to look for a skilled worker before rejecting the booking">
            <Input {...af('geoReadinessKm')} step="1" min="1" max="100" />
          </FormRow>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormRow label="Bonus Starts At Step" hint="Search step where the bonus kicks in (higher = later / wider)">
            <Input {...af('urgencyBonusStartStep')} step="1" min="0" max="10" />
          </FormRow>
          <FormRow label="Bonus Per Step (₹)" hint="Added each time the search radius widens">
            <Input {...af('urgencyBonusStepRs')} step="1" min="0" />
          </FormRow>
          <FormRow label="Bonus Cap (₹)" hint="Maximum accept bonus per order">
            <Input {...af('urgencyBonusMaxRs')} step="5" min="0" />
          </FormRow>
          <FormRow label="Head-Start Window (sec)" hint="Exclusive time the top pro gets before broadcast">
            <Input {...af('bestFirstWindowSec')} step="1" min="0" max="30" />
          </FormRow>
          <FormRow label="Head-Start Pros (count)" hint="How many top pros get the exclusive window">
            <Input {...af('bestFirstTopN')} step="1" min="1" max="5" />
          </FormRow>
        </div>
        <div className="mt-5">
          <SaveBtn loading={saving} onClick={() => saveSection({
            forceAssignEnabled:    accept.forceAssignEnabled,
            geoReadinessEnabled:   accept.geoReadinessEnabled,
            geoReadinessKm:        accept.geoReadinessKm,
            urgencyBonusEnabled:   accept.urgencyBonusEnabled,
            urgencyBonusStartStep: accept.urgencyBonusStartStep,
            urgencyBonusStepPaise: Math.round(accept.urgencyBonusStepRs * 100),
            urgencyBonusMaxPaise:  Math.round(accept.urgencyBonusMaxRs * 100),
            bestFirstEnabled:      accept.bestFirstEnabled,
            bestFirstWindowMs:     Math.round(accept.bestFirstWindowSec * 1000),
            bestFirstTopN:         accept.bestFirstTopN,
          })} />
        </div>
      </Card>

      {/* ── ZeroWait Instant Match ── */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">⚡ ZeroWait — Instant Match</h3>
        <p className="text-xs text-slate-400 mb-4">
          Every competitor waits for a worker to tap “Accept”. Ready Mode lets trusted workers
          <b> pre-accept</b> the next matching job, so dispatch locks them with no offer round-trip —
          sub-second matching. Warm Dispatch pre-checks the pool at checkout; positioning pays workers
          to serve under-supplied zones.
        </p>

        <div className="space-y-3 mb-4">
          <FormRow label="Ready Pool (pre-accept)" hint="Trusted workers auto-accept the next matching job — instant assignment, no tap">
            <Toggle value={zw.readyPoolEnabled} onChange={(v) => setZw(p => ({ ...p, readyPoolEnabled: v }))} />
          </FormRow>
          <FormRow label="Warm Dispatch" hint="Pre-check the Ready Pool at checkout so we can promise an instant match before payment">
            <Toggle value={zw.warmDispatchEnabled} onChange={(v) => setZw(p => ({ ...p, warmDispatchEnabled: v }))} />
          </FormRow>
          <FormRow label="Predictive positioning" hint="Pay a bonus on jobs in under-supplied zones so workers move toward demand">
            <Toggle value={zw.positioningEnabled} onChange={(v) => setZw(p => ({ ...p, positioningEnabled: v }))} />
          </FormRow>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormRow label="Ready bonus (₹)" hint="Paid on completion for a pre-accepted job">
            <Input {...zf('readyBonusRs')} step="5" min="0" />
          </FormRow>
          <FormRow label="Ready window (min)" hint="Ready Mode auto-expires after this">
            <Input {...zf('readyMaxMinutes')} step="5" min="5" max="120" />
          </FormRow>
          <FormRow label="Ready radius (km)" hint="Max distance a worker can auto-accept">
            <Input {...zf('readyDefaultRadiusKm')} step="1" min="1" max="25" />
          </FormRow>
          <FormRow label="Ready min rating" hint="Trust gate — they accept on the customer's behalf">
            <Input {...zf('readyMinRating')} step="0.1" min="1" max="5" />
          </FormRow>
          <FormRow label="Ready min jobs" hint="Completed jobs needed to unlock Ready Mode">
            <Input {...zf('readyMinCompletedJobs')} step="1" min="0" />
          </FormRow>
          <FormRow label="Ready ban (hours)" hint="Cancelling a pre-accepted job suspends Ready Mode this long">
            <Input {...zf('readyCancelBanHours')} step="1" min="0" />
          </FormRow>
          <FormRow label="Express bonus ×" hint="Worker bonus multiplier on Express jobs (customer pays 1.4×)">
            <Input {...zf('tierBonusMultiplierExpress')} step="0.1" min="1" max="5" />
          </FormRow>
          <FormRow label="Priority bonus ×" hint="Worker bonus multiplier on Priority jobs">
            <Input {...zf('tierBonusMultiplierPriority')} step="0.1" min="1" max="5" />
          </FormRow>
          <FormRow label="Positioning bonus (₹)" hint="Extra on jobs in under-supplied zones">
            <Input {...zf('positioningBonusRs')} step="5" min="0" />
          </FormRow>
          <FormRow label="Hot-zone gap" hint="demand − supply needed to call a zone under-supplied">
            <Input {...zf('positioningMinGap')} step="1" min="1" />
          </FormRow>
        </div>

        <div className="mt-5">
          <SaveBtn loading={saving} onClick={() => saveSection({
            readyPoolEnabled:            zw.readyPoolEnabled,
            readyMaxMinutes:             zw.readyMaxMinutes,
            readyDefaultRadiusKm:        zw.readyDefaultRadiusKm,
            readyBonusPaise:             Math.round(zw.readyBonusRs * 100),
            readyMinRating:              zw.readyMinRating,
            readyMinCompletedJobs:       zw.readyMinCompletedJobs,
            readyCancelBanHours:         zw.readyCancelBanHours,
            tierBonusMultiplierExpress:  zw.tierBonusMultiplierExpress,
            tierBonusMultiplierPriority: zw.tierBonusMultiplierPriority,
            warmDispatchEnabled:         zw.warmDispatchEnabled,
            positioningEnabled:          zw.positioningEnabled,
            positioningBonusPaise:       Math.round(zw.positioningBonusRs * 100),
            positioningMinGap:           zw.positioningMinGap,
          })} />
        </div>
      </Card>

      {/* ── Stale Order Watchdog ── */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Stale Order Watchdog</h3>
        <p className="text-xs text-slate-400 mb-4">Timers (in minutes) that trigger worker nudges and re-dispatch for stuck orders.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <FormRow label="Nudge Worker After (min)" hint="Assigned but no trip start → push alert">
            <Input {...sf('staleNudgeMinutes')} step="1" min="1" max="30" />
          </FormRow>
          <FormRow label="Re-Dispatch After (min)" hint="Strip & find new worker after this delay">
            <Input {...sf('staleRedispatchMinutes')} step="1" min="2" max="60" />
          </FormRow>
          <FormRow label="On-The-Way Alert After (min)" hint="Alert when worker takes too long en route">
            <Input {...sf('staleOtwAlertMinutes')} step="5" min="5" max="120" />
          </FormRow>
        </div>
        <div className="mt-5">
          <SaveBtn loading={saving} onClick={() => saveSection(stale)} />
        </div>
      </Card>

      {/* ── Offer Boost Controls ── */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-700">Offer Boost Settings</h3>
          <Toggle
            value={boost.boostEnabled}
            onChange={(v) => setBoost(p => ({ ...p, boostEnabled: v }))}
            label={boost.boostEnabled ? 'Enabled' : 'Disabled'}
          />
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Customers can optionally increase worker incentive during the searching phase.
          100% of the boost amount goes to worker earnings. Higher boost = workers more likely to accept.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormRow label="Max Boost (₹)" hint="Maximum boost a customer can apply per order">
            <Input type="number" value={boost.boostMaxRs} step="10" min="0"
              onChange={(e) => setBoost(p => ({ ...p, boostMaxRs: Number(e.target.value) }))} />
          </FormRow>
          <FormRow label="Boost Options (₹, comma-separated)" hint="e.g. 10,20,30,50,100">
            <Input type="text" value={boost.boostOptions}
              onChange={(e) => setBoost(p => ({ ...p, boostOptions: e.target.value }))} />
          </FormRow>
          <FormRow label="Dispatch Weight Multiplier" hint="1.5 = ₹10 boost subtracts 15 from score (lower = better)">
            <Input type="number" value={boost.boostDispatchWeight} step="0.1" min="1" max="10"
              onChange={(e) => setBoost(p => ({ ...p, boostDispatchWeight: Number(e.target.value) }))} />
          </FormRow>
        </div>
        <div className="mt-5">
          <SaveBtn loading={saving} onClick={() => saveSection({
            boostEnabled:        boost.boostEnabled,
            boostMaxPaise:       Math.round(boost.boostMaxRs * 100),
            boostOptions:        boost.boostOptions.split(',').map(Number).filter(Boolean),
            boostDispatchWeight: boost.boostDispatchWeight,
          })} />
        </div>
      </Card>

      {/* ── Tip Controls ── */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Post-Service Tip Settings</h3>
        <p className="text-xs text-slate-400 mb-4">Tips sent after service completion (voice note + credit).</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormRow label="Max Tip (₹)" hint="Maximum tip a customer can give">
            <Input type="number" value={tips.tipMaxRs} step="50" min="0"
              onChange={(e) => setTips(p => ({ ...p, tipMaxRs: Number(e.target.value) }))} />
          </FormRow>
          <FormRow label="Quick Tip Options (₹, comma-separated)" hint="e.g. 20,50,100">
            <Input type="text" value={tips.tipOptions}
              onChange={(e) => setTips(p => ({ ...p, tipOptions: e.target.value }))} />
          </FormRow>
        </div>
        <div className="mt-5">
          <SaveBtn loading={saving} onClick={() => saveSection({
            tipMaxPaise: Math.round(tips.tipMaxRs * 100),
            tipOptions:  tips.tipOptions.split(',').map(Number).filter(Boolean),
          })} />
        </div>
      </Card>

      {/* ── Referral Rewards ── */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Referral Rewards</h3>
        <p className="text-xs text-slate-400 mb-4">Bonus amounts credited when a user invites a friend who completes their first order.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormRow label="Referrer Bonus (₹)" hint="The person who shared the code earns this">
            <Input type="number" value={referral.referralReferrerBonusRs} step="10" min="0"
              onChange={(e) => setReferral(p => ({ ...p, referralReferrerBonusRs: Number(e.target.value) }))} />
          </FormRow>
          <FormRow label="Referee Bonus (₹)" hint="The new user who signed up earns this">
            <Input type="number" value={referral.referralRefereeBonusRs} step="10" min="0"
              onChange={(e) => setReferral(p => ({ ...p, referralRefereeBonusRs: Number(e.target.value) }))} />
          </FormRow>
        </div>
        <div className="mt-5">
          <SaveBtn loading={saving} onClick={() => saveSection({
            referralReferrerBonusPaise: Math.round(referral.referralReferrerBonusRs * 100),
            referralRefereeBonusPaise:  Math.round(referral.referralRefereeBonusRs  * 100),
          })} />
        </div>
      </Card>

      {/* ── Late Arrival Penalty ── */}
      <Card className="p-6 ring-2 ring-red-100">
        <h3 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
          <span>⏱️</span> Late Arrival Penalty
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Deducted from worker earnings when they arrive later than the ETA computed at trip start.
          ETA = haversine distance ÷ 25 km/h urban speed. Grace period gives buffer for minor delays.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormRow label="Penalty per extra minute (₹)" hint="Amount deducted per minute overdue">
            <Input type="number" value={penalty.lateArrivalPenaltyRsPerMin} step="1" min="0" max="50"
              onChange={(e) => setPenalty(p => ({ ...p, lateArrivalPenaltyRsPerMin: Number(e.target.value) }))} />
          </FormRow>
          <FormRow label="Grace period (minutes)" hint="No penalty within this buffer after ETA">
            <Input type="number" value={penalty.lateArrivalGraceMinutes} step="1" min="0" max="15"
              onChange={(e) => setPenalty(p => ({ ...p, lateArrivalGraceMinutes: Number(e.target.value) }))} />
          </FormRow>
        </div>
        <p className="text-[11px] text-slate-400 mt-3 bg-red-50 rounded-lg px-3 py-2">
          Example: ETA = 8 min · Worker arrives in 15 min · Grace = {penalty.lateArrivalGraceMinutes} min → Late by {Math.max(0,15-8-penalty.lateArrivalGraceMinutes)} min → Deduct <strong>₹{Math.max(0,15-8-penalty.lateArrivalGraceMinutes) * penalty.lateArrivalPenaltyRsPerMin}</strong>
        </p>
        <div className="mt-5">
          <SaveBtn loading={saving} onClick={() => saveSection({
            lateArrivalPenaltyPaisePerMin: Math.round(penalty.lateArrivalPenaltyRsPerMin * 100),
            lateArrivalGraceMinutes:       penalty.lateArrivalGraceMinutes,
          })} />
        </div>
      </Card>

      {/* ── Service Tier Pricing ── */}
      <Card className="p-6 ring-2 ring-indigo-100">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Service Tier Pricing</h3>
        <p className="text-xs text-slate-400 mb-4">
          Controls the price multiplier and maximum dispatch search time for Priority and Express bookings.
          Standard is always 1.0×. Express guarantees worker assignment within the express search window.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Priority */}
          <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">⭐</span>
              <p className="text-sm font-black text-amber-800">Priority Tier</p>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">4.5★+ workers</span>
            </div>
            <FormRow label="Price Multiplier" hint="e.g. 1.2 = 20% premium on base fare">
              <Input type="number" value={tiers.tierMultiplierPriority} step="0.05" min="1" max="3"
                onChange={(e) => setTiers(p => ({ ...p, tierMultiplierPriority: Number(e.target.value) }))} />
            </FormRow>
            <FormRow label="Max Search Window (sec)" hint="Force-assign after this many seconds">
              <Input type="number" value={tiers.tierPriorityMaxSearchSec} step="30" min="60" max="600"
                onChange={(e) => setTiers(p => ({ ...p, tierPriorityMaxSearchSec: Number(e.target.value) }))} />
            </FormRow>
          </div>
          {/* Express */}
          <div className="rounded-xl bg-indigo-50 ring-1 ring-indigo-200 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">⚡</span>
              <p className="text-sm font-black text-indigo-800">Express Tier</p>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">Instant match</span>
            </div>
            <FormRow label="Price Multiplier" hint="e.g. 1.4 = 40% premium on base fare">
              <Input type="number" value={tiers.tierMultiplierExpress} step="0.05" min="1" max="3"
                onChange={(e) => setTiers(p => ({ ...p, tierMultiplierExpress: Number(e.target.value) }))} />
            </FormRow>
            <FormRow label="Max Search Window (sec)" hint="Force-assign after this many seconds (≤60 for true instant)">
              <Input type="number" value={tiers.tierExpressMaxSearchSec} step="15" min="30" max="300"
                onChange={(e) => setTiers(p => ({ ...p, tierExpressMaxSearchSec: Number(e.target.value) }))} />
            </FormRow>
          </div>
        </div>
        <div className="mt-5">
          <SaveBtn loading={saving} onClick={() => saveSection({
            tierMultiplierPriority:  tiers.tierMultiplierPriority,
            tierMultiplierExpress:   tiers.tierMultiplierExpress,
            tierExpressMaxSearchMs:  tiers.tierExpressMaxSearchSec  * 1000,
            tierPriorityMaxSearchMs: tiers.tierPriorityMaxSearchSec * 1000,
          })} />
        </div>
      </Card>

      {/* ── Auto-Pricing Rules ── */}
      <Card className="p-6 ring-2 ring-purple-100">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-700">Auto-Pricing Rules</h3>
          <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">Dynamic Surge</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Automatically apply extra multipliers on top of demand/supply surge. All factors stack multiplicatively.
          Night × Rain × Weekend × Peak apply on top of the base demand ratio.
        </p>

        {/* Night */}
        <div className="border border-slate-100 rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Night Surcharge</p>
              <p className="text-xs text-slate-400">Extra multiplier during late-night hours (IST)</p>
            </div>
            <Toggle value={autoPricing.nightSurchargeEnabled}
              onChange={(v) => setAutoPricing(p => ({ ...p, nightSurchargeEnabled: v }))} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <FormRow label="Start Hour (IST, 0–23)" hint="e.g. 22 = 10 PM">
              <Input type="number" value={autoPricing.nightStartHour} min="0" max="23" step="1"
                onChange={(e) => setAutoPricing(p => ({ ...p, nightStartHour: Number(e.target.value) }))} />
            </FormRow>
            <FormRow label="End Hour (IST, 0–23)" hint="e.g. 6 = 6 AM">
              <Input type="number" value={autoPricing.nightEndHour} min="0" max="23" step="1"
                onChange={(e) => setAutoPricing(p => ({ ...p, nightEndHour: Number(e.target.value) }))} />
            </FormRow>
            <FormRow label="Multiplier" hint="e.g. 1.3 = 30% extra">
              <Input type="number" value={autoPricing.nightSurchargeMultiplier} min="1.0" max="3.0" step="0.05"
                onChange={(e) => setAutoPricing(p => ({ ...p, nightSurchargeMultiplier: Number(e.target.value) }))} />
            </FormRow>
          </div>
        </div>

        {/* Weekend */}
        <div className="border border-slate-100 rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Weekend Surcharge</p>
              <p className="text-xs text-slate-400">Extra multiplier on Saturdays and Sundays</p>
            </div>
            <Toggle value={autoPricing.weekendSurchargeEnabled}
              onChange={(v) => setAutoPricing(p => ({ ...p, weekendSurchargeEnabled: v }))} />
          </div>
          <div className="grid sm:grid-cols-1 gap-3 max-w-xs">
            <FormRow label="Multiplier" hint="e.g. 1.1 = 10% extra on weekends">
              <Input type="number" value={autoPricing.weekendSurchargeMultiplier} min="1.0" max="2.0" step="0.05"
                onChange={(e) => setAutoPricing(p => ({ ...p, weekendSurchargeMultiplier: Number(e.target.value) }))} />
            </FormRow>
          </div>
        </div>

        {/* Peak hours */}
        <div className="border border-slate-100 rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Peak Hour Windows</p>
              <p className="text-xs text-slate-400">Each window applies its multiplier for orders during those IST hours</p>
            </div>
            <Toggle value={autoPricing.peakHourSurchargeEnabled}
              onChange={(v) => setAutoPricing(p => ({ ...p, peakHourSurchargeEnabled: v }))} />
          </div>
          {autoPricing.peakHourRanges.map((r, idx) => (
            <div key={idx} className="grid grid-cols-5 gap-2 items-end mb-2">
              <FormRow label="Label">
                <Input type="text" value={r.label}
                  onChange={(e) => updatePeakRange(idx, 'label', e.target.value)} />
              </FormRow>
              <FormRow label="Start Hr">
                <Input type="number" value={r.startHour} min="0" max="23" step="1"
                  onChange={(e) => updatePeakRange(idx, 'startHour', Number(e.target.value))} />
              </FormRow>
              <FormRow label="End Hr">
                <Input type="number" value={r.endHour} min="0" max="23" step="1"
                  onChange={(e) => updatePeakRange(idx, 'endHour', Number(e.target.value))} />
              </FormRow>
              <FormRow label="Multiplier">
                <Input type="number" value={r.multiplier} min="1.0" max="3.0" step="0.05"
                  onChange={(e) => updatePeakRange(idx, 'multiplier', Number(e.target.value))} />
              </FormRow>
              <button onClick={() => removePeakRange(idx)}
                className="mb-1 text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1.5 rounded-lg bg-red-50 hover:bg-red-100">
                Remove
              </button>
            </div>
          ))}
          <button onClick={addPeakRange}
            className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100">
            + Add Peak Window
          </button>
        </div>

        {/* Surge tolerance */}
        <div className="border border-slate-100 rounded-xl p-4 mb-3">
          <p className="text-sm font-semibold text-slate-700 mb-1">Surge Tolerance at Booking</p>
          <p className="text-xs text-slate-400 mb-3">
            If the price at submit is X% higher than the quoted price, the order is blocked and the customer must re-confirm.
          </p>
          <div className="max-w-xs">
            <FormRow label="Max allowed increase (%)" hint="e.g. 10 = up to 10% increase is silently accepted">
              <div className="flex items-center gap-2">
                <Input type="number" value={autoPricing.surgeTolerancePct} min="2" max="50" step="1"
                  onChange={(e) => setAutoPricing(p => ({ ...p, surgeTolerancePct: Number(e.target.value) }))} />
                <span className="font-bold text-slate-700">{autoPricing.surgeTolerancePct}%</span>
              </div>
            </FormRow>
          </div>
        </div>

        <div className="mt-4"><SaveBtn loading={saving} onClick={saveAutoPricing} /></div>
      </Card>

      {/* ── Rain Mode ── */}
      <Card className={`p-6 ${isRainActive ? 'ring-2 ring-blue-300 bg-blue-50' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span>🌧️</span> Rain Surcharge Mode
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRainActive
                ? `ACTIVE — Rain surcharge of ${autoPricing.rainSurchargeMultiplier}× is live. Expires in ${rainExpiresIn} min.`
                : 'Inactive — manually activate when it is raining to apply extra surge.'}
            </p>
          </div>
          <div className="shrink-0 text-right space-y-2">
            <div className="flex items-center gap-2">
              <FormRow label="Multiplier" hint="">
                <Input type="number" value={autoPricing.rainSurchargeMultiplier} min="1.0" max="3.0" step="0.05"
                  onChange={(e) => setAutoPricing(p => ({ ...p, rainSurchargeMultiplier: Number(e.target.value) }))} />
              </FormRow>
              <FormRow label="Enable rain surge" hint="">
                <Toggle value={autoPricing.rainSurchargeEnabled}
                  onChange={(v) => setAutoPricing(p => ({ ...p, rainSurchargeEnabled: v }))} />
              </FormRow>
            </div>
            <div className="flex items-center gap-2 justify-end">
              {!isRainActive && (
                <select value={rainDurationHours} onChange={(e) => setRainDurationHours(Number(e.target.value))}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700">
                  <option value={1}>1 hour</option>
                  <option value={2}>2 hours</option>
                  <option value={3}>3 hours</option>
                  <option value={6}>6 hours</option>
                </select>
              )}
              <button
                disabled={saving}
                onClick={toggleRainMode}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  isRainActive
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-800 text-white hover:bg-slate-900'
                }`}
              >
                {isRainActive ? 'Turn Off Rain Mode' : 'Turn On Rain Mode'}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Earned Wage + Emergency Fund ── */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-1">Worker Finance</h3>
        <p className="text-xs text-slate-400 mb-4">Earned wage advance and emergency mutual fund settings.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <FormRow label="Earned Wage Advance" hint="Allow workers to withdraw earned wages early">
            <Toggle value={wallet.earnedWageAdvanceEnabled}
              onChange={(v) => setWallet(p => ({ ...p, earnedWageAdvanceEnabled: v }))} />
          </FormRow>
          <FormRow label="Advance Rate (%)" hint="% of earned wages worker can withdraw early">
            <div className="flex items-center gap-2">
              <Input type="number" value={wallet.earnedWageAdvanceRate} step="5" min="10" max="100"
                onChange={(e) => setWallet(p => ({ ...p, earnedWageAdvanceRate: Number(e.target.value) }))} />
              <span className="text-base font-bold text-slate-700">{wallet.earnedWageAdvanceRate}%</span>
            </div>
          </FormRow>
          <FormRow label="Emergency Fund Contribution (%)" hint="% of platform commission that goes to worker mutual aid">
            <div className="flex items-center gap-2">
              <Input type="number" value={wallet.emergencyFundContributionRate} step="0.1" min="0" max="5"
                onChange={(e) => setWallet(p => ({ ...p, emergencyFundContributionRate: Number(e.target.value) }))} />
              <span className="text-base font-bold text-slate-700">{wallet.emergencyFundContributionRate}%</span>
            </div>
          </FormRow>
        </div>
        <div className="mt-5">
          <SaveBtn loading={saving} onClick={() => saveSection({
            earnedWageAdvanceEnabled:      wallet.earnedWageAdvanceEnabled,
            earnedWageAdvanceRate:         wallet.earnedWageAdvanceRate / 100,
            emergencyFundContributionRate: wallet.emergencyFundContributionRate / 100,
          })} />
        </div>
      </Card>
    </div>
  );
}
