import { usePendingCustomerRatingQuery } from '../../services/api';
import RateCustomerCard from './RateCustomerCard';

// After a job the pro rates the customer before going on: the card stays over Home until a rating is sent (jobs/customer-rating pendingFor).
export default function RateCustomerPrompt() {
  const { data } = usePendingCustomerRatingQuery();
  const job = data?.pending;
  if (!job) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Rate the customer">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">Job done{job.reference ? ` · ${job.reference}` : ''}</p>
        <p className="mb-3 text-[15px] font-bold text-navy">Rate the customer to continue.</p>
        <RateCustomerCard jobId={job.id} rated={false} />
      </div>
    </div>
  );
}
