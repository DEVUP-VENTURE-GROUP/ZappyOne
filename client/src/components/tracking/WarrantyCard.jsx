/**
 * Warranty Card — shown in Order History after completion.
 * Customer sees expiry date + can file a claim with one tap.
 * No Indian competitor shows warranty cards with in-app claims.
 */
import { motion } from 'framer-motion';
import { ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { useGetOrderWarrantyQuery } from '@shared/services/api';

export default function WarrantyCard({ orderId, onClaimClick }) {
  const { data, isLoading } = useGetOrderWarrantyQuery(orderId);
  const warranty = data?.warranty;
  if (isLoading || !warranty) return null;

  const now       = new Date();
  const expires   = new Date(warranty.expiresAt);
  const daysLeft  = Math.max(0, Math.ceil((expires - now) / 86400000));
  const isExpired = warranty.status === 'expired' || expires < now;
  const isClaimed = warranty.status === 'claimed' || warranty.status === 'resolved';

  if (isExpired || isClaimed) return null;

  const urgent = daysLeft <= 7;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card ring-1 ${urgent ? 'bg-amber-50 ring-amber-200' : 'bg-green-50 ring-green-100'} flex items-center gap-3`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${urgent ? 'bg-amber-100' : 'bg-green-100'}`}>
        <ShieldCheck size={16} strokeWidth={2} className={urgent ? 'text-amber-600' : 'text-green-600'} />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-bold ${urgent ? 'text-amber-800' : 'text-green-800'}`}>
          {warranty.warrantyDays}-day warranty active
        </p>
        <p className={`text-[11px] font-medium ${urgent ? 'text-amber-600' : 'text-green-600'}`}>
          {daysLeft > 0
            ? `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} · ${expires.toLocaleDateString('en-IN')}`
            : 'Expires today!'}
        </p>
      </div>
      {urgent && (
        <button
          onClick={() => onClaimClick?.(warranty)}
          className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1.5 rounded-full"
        >
          <RefreshCw size={11} /> Claim
        </button>
      )}
    </motion.div>
  );
}
