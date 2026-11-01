import { Wallet, X } from 'lucide-react';
import { useWorkerDuesQuery, useShopDuesQuery } from '../../services/api';
import { useSelector } from 'react-redux';
import { selectAuth } from '../../modules/auth/authSlice';
import PayDuesButton from '../../provider/components/PayDuesButton';

const rupees = (p) => `₹${Math.round((p || 0) / 100).toLocaleString('en-IN')}`;

// Over the dues limit when a job rings: pay what is owed, and the job is taken in the same step.
export default function PayToAccept({ duesPaise, onPaid, onClose }) {
  const { role } = useSelector(selectAuth);
  const { data: w } = useWorkerDuesQuery(undefined, { skip: role !== 'worker' });
  const { data: s } = useShopDuesQuery(undefined, { skip: role !== 'shop' });
  const owed = duesPaise ?? (role === 'shop' ? s?.duesPaise : w?.dues?.duesPaise) ?? 0;
  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-ink-900/50 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pta-title">
      <div className="w-full max-w-md rounded-t-sheet bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-sheet">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-btn bg-zappy-50 text-zappy-700"><Wallet size={20} /></span>
          <div className="min-w-0 flex-1">
            <p id="pta-title" className="text-[18px] font-extrabold text-ink-900">Pay {rupees(owed)} to take this job</p>
            <p className="mt-1 text-[13.5px] text-ink-500">Your ZappyOne dues are over the limit. Pay now and the job is yours, if it is still open.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-sunken"><X size={18} /></button>
        </div>
        <div className="mt-4">
          <PayDuesButton duesPaise={owed} onPaid={onPaid} />
          {!owed && <p className="text-[13px] text-ink-500">Checking what you owe.</p>}
        </div>
      </div>
    </div>
  );
}
