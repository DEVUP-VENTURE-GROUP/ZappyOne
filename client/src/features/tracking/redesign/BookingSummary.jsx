import { Clock, FileText, Hash, MapPin, ReceiptText, Wallet, Wrench } from 'lucide-react';
import { rupeesOf, shortId } from '@shared/customer/trackingSteps';
import { Row, Section } from './Section';

// Booking details as UC lists them: one line each for when, where, what and the money; only lines the server recorded.
export default function BookingSummary({ job, onReceipt, onEditPlace }) {
  const price = job.price || {};
  const when = job.scheduledAt || job.createdAt;
  const lines = (price.lines || []).filter(([, paise]) => paise && paise !== 0);
  const totalLabel = price.isEstimate ? 'estimated total' : price.paid ? 'paid' : 'total amount';

  return (
    <Section title="Booking details">
      <div className="divide-y divide-line">
        {when && <Row Icon={Clock} title={new Date(when).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} sub={job.scheduledAt ? 'Booked for' : 'Booked at'} />}
        {job.place?.address && <Row Icon={MapPin} title={<span className="line-clamp-2">{job.place.address}</span>}
          right={onEditPlace ? <button type="button" onClick={onEditPlace} className="shrink-0 text-[14px] font-bold text-ink-900 underline underline-offset-2">Edit</button> : undefined} />}
        <Row Icon={Wrench} title={<span className="capitalize">{job.service}</span>} sub={job.subtitle ? `${job.subtitleLabel || 'For'}: ${job.subtitle}` : null} />
        {price.method && <Row Icon={Wallet} title={price.method} sub="Payment" />}
        {price.totalPaise != null && (
          <div className="py-3.5">
            <div className="flex items-center gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-ink-900"><ReceiptText size={19} strokeWidth={1.9} /></span>
              <p className="flex-1 text-[15px] text-ink-900"><b className="tabular-nums">{rupeesOf(price.totalPaise)}</b> {totalLabel}</p>
            </div>
            {lines.length > 0 && (
              <dl className="ml-[54px] mt-2 space-y-1 text-[13px]">
                {lines.map(([label, paise]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-ink-500">{label}</dt>
                    <dd className={`tabular-nums ${paise < 0 ? 'text-green-700' : 'text-ink-700'}`}>{paise < 0 ? `− ${rupeesOf(-paise)}` : rupeesOf(paise)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {price.note && <p className="ml-[54px] mt-2 text-[12px] leading-relaxed text-ink-500">{price.note}</p>}
          </div>
        )}
        {onReceipt && <Row Icon={FileText} title="Download receipt" onClick={onReceipt} />}
        <Row Icon={Hash} title={<span className="tabular-nums">{job.reference || `#${shortId(job.id)}`}</span>} sub="Booking ID" />
      </div>
    </Section>
  );
}
