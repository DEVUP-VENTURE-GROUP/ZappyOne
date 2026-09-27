import { useAdminFeatureFlagsQuery, useAdminSetFeatureFlagMutation } from '@client/services/api';
import { SectionHeader, Card, PageLoader } from './_shared';
import { ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';

const FLAG_META = {
  surge_pricing:   { label: 'Surge Pricing',     desc: 'Dynamic price multipliers during high demand periods' },
  promo_codes:     { label: 'Promo Codes',        desc: 'Allow users to apply discount promo codes at checkout' },
  gamification:    { label: 'Gamification',       desc: 'XP points, levels, badges, and streaks for users' },
  ads:             { label: 'Ad Campaigns',        desc: 'Display banner ads to users in the app' },
  chat:            { label: 'In-App Chat',         desc: 'Real-time chat between user and assigned worker' },
  live_tracking:   { label: 'Live Tracking',       desc: 'Worker GPS tracking and ETA shown to user' },
  worker_ratings:  { label: 'Worker Ratings',      desc: 'Post-order rating and review system' },
  cashback:        { label: 'Cashback',            desc: 'Wallet cashback rewards on completed orders' },
  referrals:       { label: 'Referrals',           desc: 'Refer a friend program with bonus credits' },
  notifications:   { label: 'Push Notifications', desc: 'FCM push notifications to user and worker devices' },
};

export default function FeatureFlags() {
  const { data, isLoading } = useAdminFeatureFlagsQuery();
  const [setFlag, { isLoading: saving }] = useAdminSetFeatureFlagMutation();

  if (isLoading) return <PageLoader />;

  const flags = data?.flags || {};

  async function toggle(flag, current) {
    await setFlag({ flag, enabled: !current });
  }

  const enabled  = Object.entries(flags).filter(([, v]) => v).length;
  const total    = Object.keys(flags).length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Feature Flags"
        subtitle={`${enabled} of ${total} features enabled — changes apply immediately`}
      />

      <Card className="divide-y divide-slate-50">
        {Object.entries(FLAG_META).map(([key, { label, desc }]) => {
          const on = flags[key] ?? true;
          return (
            <div key={key} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition group">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
              <button
                onClick={() => toggle(key, on)}
                disabled={saving}
                className="flex items-center gap-2 shrink-0 transition"
              >
                {saving
                  ? <Loader2 size={20} className="animate-spin text-slate-400" />
                  : on
                    ? <ToggleRight size={28} className="text-blue-600 hover:text-blue-700 transition" />
                    : <ToggleLeft  size={28} className="text-slate-300 hover:text-slate-400 transition" />
                }
                <span className={`text-xs font-bold w-12 text-right ${on ? 'text-blue-600' : 'text-slate-400'}`}>
                  {on ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          );
        })}
      </Card>

      <p className="text-xs text-slate-400 text-center">
        Feature flag changes are stored in Redis and take effect immediately for new requests.
        No deployment required.
      </p>
    </div>
  );
}
